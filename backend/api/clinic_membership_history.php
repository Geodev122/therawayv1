<?php
// backend/api/clinic_membership_history.php

declare(strict_types=1);
ini_set('display_errors', '0'); // Errors should be logged, not displayed in API output
error_reporting(E_ALL);

// --- Includes ---
require_once __DIR__ . '/../config/core.php';
require_once __DIR__ . '/../config/db.php'; // Provides $pdo
require_once __DIR__ . '/../vendor/autoload.php'; // Composer autoloader

use Firebase\JWT\JWT;
use Firebase\JWT\Key;
use Firebase\JWT\ExpiredException;
use Firebase\JWT\SignatureInvalidException;
use Firebase\JWT\BeforeValidException;

// --- CORS Handling ---
handleCors(); // From core.php

// --- Request Method Check ---
$method = strtoupper($_SERVER['REQUEST_METHOD']);
$jwtKey = defined('JWT_SECRET_KEY') ? JWT_SECRET_KEY : null;

if (!$jwtKey) {
    error_log("JWT_SECRET_KEY is not defined in core.php for clinic_membership_history.php");
    sendJsonResponse(['status' => 'error', 'message' => 'Server configuration error.'], 500);
}

/**
 * Helper function to get authenticated user ID and role from JWT.
 * Allows CLINIC_OWNER or ADMIN.
 * @param string $jwtKey The JWT secret key.
 * @return array ['userId' => string, 'role' => string] or exits.
 */
function getAuthenticatedUser(string $jwtKey): array {
    if (!isset($_SERVER['HTTP_AUTHORIZATION'])) {
        sendJsonResponse(['status' => 'error', 'message' => 'Authorization header missing.'], 401);
    }
    $authHeader = $_SERVER['HTTP_AUTHORIZATION'];
    list($type, $token) = explode(' ', $authHeader, 2);

    if (strcasecmp($type, 'Bearer') !== 0 || empty($token)) {
        sendJsonResponse(['status' => 'error', 'message' => 'Invalid token type or token is empty.'], 401);
    }

    try {
        $decoded = JWT::decode($token, new Key($jwtKey, 'HS256'));
        if (!isset($decoded->data) || !isset($decoded->data->userId) || !isset($decoded->data->role)) {
            sendJsonResponse(['status' => 'error', 'message' => 'Invalid token payload.'], 401);
        }
        if (!in_array($decoded->data->role, ['CLINIC_OWNER', 'ADMIN'])) {
            sendJsonResponse(['status' => 'error', 'message' => 'Access denied. Clinic Owner or Admin role required.'], 403);
        }
        return ['userId' => $decoded->data->userId, 'role' => $decoded->data->role];
    } catch (ExpiredException $e) {
        sendJsonResponse(['status' => 'error', 'message' => 'Token has expired.'], 401);
    } catch (SignatureInvalidException $e) {
        sendJsonResponse(['status' => 'error', 'message' => 'Token signature invalid.'], 401);
    } catch (BeforeValidException $e) {
        sendJsonResponse(['status' => 'error', 'message' => 'Token not yet valid.'], 401);
    } catch (Exception $e) {
        error_log("JWT Decode Error for clinic_membership_history: " . $e->getMessage());
        sendJsonResponse(['status' => 'error', 'message' => 'Invalid token: ' . $e->getMessage()], 401);
    }
    exit; // Should not reach here
}


// --- Process GET Request for Membership History ---
if ($method === 'GET') {
    $authData = getAuthenticatedUser($jwtKey);
    $loggedInUserId = $authData['userId'];
    $loggedInUserRole = $authData['role'];

    $clinicIdToFetch = $_GET['clinicId'] ?? null;

    if (empty($clinicIdToFetch)) {
        sendJsonResponse(['status' => 'error', 'message' => 'Clinic ID is required.'], 400);
    }

    try {
        // Authorization: If logged-in user is a CLINIC_OWNER, they can only fetch history for their own clinic.
        // Admins can fetch for any clinic.
        if ($loggedInUserRole === 'CLINIC_OWNER') {
            $stmtCheckOwner = $pdo->prepare("SELECT user_id FROM clinics_data WHERE clinic_id = :clinic_id AND user_id = :owner_id");
            $stmtCheckOwner->bindParam(':clinic_id', $clinicIdToFetch);
            $stmtCheckOwner->bindParam(':owner_id', $loggedInUserId);
            $stmtCheckOwner->execute();
            if (!$stmtCheckOwner->fetch()) {
                sendJsonResponse(['status' => 'error', 'message' => 'Unauthorized to view this clinic\'s membership history.'], 403);
            }
        }

        // Fetch membership history for the specified clinic ID
        $stmt = $pdo->prepare("
            SELECT id, action_date as date, action_description as action, details_json as details 
            FROM membership_history 
            WHERE target_id = :clinic_id AND target_type = 'CLINIC'
            ORDER BY action_date DESC
        ");
        $stmt->bindParam(':clinic_id', $clinicIdToFetch);
        $stmt->execute();
        $history = $stmt->fetchAll(PDO::FETCH_ASSOC);

        // Decode details_json for each history item
        foreach ($history as &$item) {
            if (isset($item['details']) && $item['details'] !== null) {
                $decodedDetails = json_decode($item['details'], true);
                // If details_json was a simple string rather than JSON, json_decode might return null or the string itself.
                // The frontend type expects `details` to be a string, so re-encode if it was an object/array,
                // or just ensure it's a string.
                if (is_array($decodedDetails) || is_object($decodedDetails)) {
                    // For simplicity, let's just pass the JSON string as is, or format it.
                    // The frontend type `MembershipHistoryItem.details` is `string | undefined`.
                    // If the DB stores actual JSON, we might want to re-encode it or pick specific fields.
                    // For now, we'll assume the frontend can handle the JSON string in `details`.
                    // If you want to make it a plain string for the frontend, you'd process $decodedDetails here.
                    // $item['details'] = "Tier: " . ($decodedDetails['tier'] ?? 'N/A') . ", Fee: " . ($decodedDetails['fee'] ?? 'N/A');
                } else {
                    // If details was not valid JSON or already a string.
                    $item['details'] = $item['details']; // Keep as is
                }
            } else {
                $item['details'] = null; // Ensure it's explicitly null if not set
            }
        }
        unset($item); // Unset reference

        sendJsonResponse(['status' => 'success', 'history' => $history], 200);

    } catch (PDOException $e) {
        error_log("Database error fetching clinic membership history: " . $e->getMessage());
        sendJsonResponse(['status' => 'error', 'message' => 'A server error occurred while fetching membership history.'], 500);
    }

} else {
    sendJsonResponse(['status' => 'error', 'message' => 'Invalid request method. Only GET is accepted for this endpoint.'], 405);
}
?>