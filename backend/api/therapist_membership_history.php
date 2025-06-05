<?php
// backend/api/therapist_membership_history.php

declare(strict_types=1);
ini_set('display_errors', '0'); // Errors should be logged, not displayed in API output
error_reporting(E_ALL);

try { // Global try-catch block to handle any unhandled errors
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
        error_log("JWT_SECRET_KEY is not defined in core.php for therapist_membership_history.php");
        sendJsonResponse(['status' => 'error', 'message' => 'Server configuration error.'], 500);
    }

    /**
     * Helper function to get authenticated user ID and role from JWT.
     * Allows THERAPIST or ADMIN.
     * @param string $jwtKey The JWT secret key.
     * @return array ['userId' => string, 'role' => string] or exits.
     */
    function getAuthenticatedUser(string $jwtKey): array {
        if (!isset($_SERVER['HTTP_AUTHORIZATION'])) {
            sendJsonResponse(['status' => 'error', 'message' => 'Authorization header missing.'], 401);
        }
        $authHeader = $_SERVER['HTTP_AUTHORIZATION'];
        if (!str_contains($authHeader, ' ')) {
            sendJsonResponse(['status' => 'error', 'message' => 'Invalid Authorization header format.'], 401);
        }
        list($type, $token) = explode(' ', $authHeader, 2);

        if (strcasecmp($type, 'Bearer') !== 0 || empty($token)) {
            sendJsonResponse(['status' => 'error', 'message' => 'Invalid token type or token is empty.'], 401);
        }

        try {
            $decoded = JWT::decode($token, new Key($jwtKey, 'HS256'));
            if (!isset($decoded->data) || !isset($decoded->data->userId) || !isset($decoded->data->role)) {
                sendJsonResponse(['status' => 'error', 'message' => 'Invalid token payload.'], 401);
            }
            // Ensure role is one of the allowed roles for this specific endpoint
            if (!in_array($decoded->data->role, ['THERAPIST', 'ADMIN'])) {
                sendJsonResponse(['status' => 'error', 'message' => 'Access denied. Therapist or Admin role required.'], 403);
            }
            return ['userId' => $decoded->data->userId, 'role' => $decoded->data->role];
        } catch (ExpiredException $e) {
            sendJsonResponse(['status' => 'error', 'message' => 'Token has expired.'], 401);
        } catch (SignatureInvalidException $e) {
            sendJsonResponse(['status' => 'error', 'message' => 'Token signature invalid.'], 401);
        } catch (BeforeValidException $e) {
            sendJsonResponse(['status' => 'error', 'message' => 'Token not yet valid.'], 401);
        } catch (Exception $e) {
            error_log("JWT Decode Error for therapist_membership_history: " . $e->getMessage());
            sendJsonResponse(['status' => 'error', 'message' => 'Invalid token: ' . $e->getMessage()], 401);
        }
        exit; // Should not reach here if sendJsonResponse exits
    }


    // --- Process GET Request for Membership History ---
    if ($method === 'GET') {
        $authData = getAuthenticatedUser($jwtKey);
        $loggedInUserId = $authData['userId'];
        $loggedInUserRole = $authData['role'];

        // Get the therapist's user ID from query parameter
        $therapistIdToFetch = $_GET['userId'] ?? null;

        if (empty($therapistIdToFetch)) {
            sendJsonResponse(['status' => 'error', 'message' => 'Therapist User ID is required.'], 400);
        }

        // Authorization:
        // If the logged-in user is a THERAPIST, they can only fetch their own history.
        // ADMINS can fetch history for any therapist.
        if ($loggedInUserRole === 'THERAPIST' && $therapistIdToFetch !== $loggedInUserId) {
            sendJsonResponse(['status' => 'error', 'message' => 'Unauthorized to view this therapist\'s membership history.'], 403);
        }

        try {
            // Fetch membership history for the specified therapist user ID
            $stmt = $pdo->prepare("
                SELECT id, action_date as date, action_description as action, details_json as details 
                FROM membership_history 
                WHERE target_id = :therapist_user_id AND target_type = 'THERAPIST'
                ORDER BY action_date DESC
            ");
            $stmt->bindParam(':therapist_user_id', $therapistIdToFetch);
            $stmt->execute();
            $history = $stmt->fetchAll(PDO::FETCH_ASSOC);

            // Process 'details_json' if needed, or send as is if frontend expects JSON string
            foreach ($history as &$item) {
                if (isset($item['details']) && $item['details'] !== null) {
                    // The frontend type `MembershipHistoryItem.details` is `string | undefined`.
                    // If details_json is an actual JSON object in the DB, the frontend might parse it.
                    // If you want to transform it into a simple string here, you would:
                    // $decodedDetails = json_decode($item['details'], true);
                    // if (is_array($decodedDetails)) {
                    //     $item['details'] = "Tier: " . ($decodedDetails['tier'] ?? 'N/A') . ", Fee: " . ($decodedDetails['fee'] ?? 'N/A');
                    // } else { $item['details'] = $item['details']; // Keep as is if not valid JSON or already string }
                    // For now, send the JSON string as is, assuming frontend handles it or it's simple.
                } else {
                    $item['details'] = null; // Ensure it's explicitly null if not set
                }
            }
            unset($item); // Unset reference from last element

            sendJsonResponse(['status' => 'success', 'history' => $history], 200);

        } catch (PDOException $e) {
            error_log("Database error fetching therapist membership history for user_id {$therapistIdToFetch}: " . $e->getMessage());
            sendJsonResponse(['status' => 'error', 'message' => 'A server error occurred while fetching membership history.'], 500);
        }

    } else {
        sendJsonResponse(['status' => 'error', 'message' => 'Invalid request method. Only GET is accepted for this endpoint.'], 405);
    }
} catch (Throwable $e) {
    // Log the error and send a clean JSON response
    error_log("Unhandled error in therapist_membership_history.php: " . $e->getMessage());
    error_log("Stack trace: " . $e->getTraceAsString());
    sendJsonResponse(['status' => 'error', 'message' => 'An unexpected error occurred.'], 500);
}
?>