<?php
// backend/api/therapist_certifications.php

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

// --- Request Method & JWT Key ---
$method = strtoupper($_SERVER['REQUEST_METHOD']);
$jwtKey = defined('JWT_SECRET_KEY') ? JWT_SECRET_KEY : null;

if (!$jwtKey && in_array($method, ['POST', 'PUT', 'DELETE'])) {
    error_log("JWT_SECRET_KEY is not defined in core.php for therapist_certifications.php (Authenticated Action)");
    sendJsonResponse(['status' => 'error', 'message' => 'Server configuration error (JWT).'], 500);
}

/**
 * Helper function to get authenticated user ID and role from JWT.
 * Sends error response and exits if authentication fails.
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
        return ['userId' => $decoded->data->userId, 'role' => $decoded->data->role];
    } catch (ExpiredException $e) {
        sendJsonResponse(['status' => 'error', 'message' => 'Token has expired.'], 401);
    } catch (SignatureInvalidException $e) {
        sendJsonResponse(['status' => 'error', 'message' => 'Token signature invalid.'], 401);
    } catch (BeforeValidException $e) {
        sendJsonResponse(['status' => 'error', 'message' => 'Token not yet valid.'], 401);
    } catch (Exception $e) {
        error_log("JWT Decode Error for therapist_certifications: " . $e->getMessage());
        sendJsonResponse(['status' => 'error', 'message' => 'Invalid token: ' . $e->getMessage()], 401);
    }
    exit; // Should not reach here
}

/**
 * Fetches the full therapist profile including certifications.
 * @param string $userId The therapist's user ID.
 * @param PDO $pdo The PDO database connection object.
 * @return array|null The therapist profile or null if not found.
 */
function fetchFullTherapistProfile(string $userId, PDO $pdo): ?array {
    $stmt = $pdo->prepare("
        SELECT 
            u.id, u.name, u.email, u.profile_picture_url,
            td.bio, td.whatsapp_number, td.intro_video_url, td.account_status,
            td.admin_notes, td.membership_application_date, td.membership_payment_receipt_url,
            td.membership_status_message, td.membership_renewal_date,
            td.specializations, td.languages, td.qualifications, td.locations,
            td.rating, td.review_count, td.profile_views, td.likes_count,
            td.is_overall_verified, td.availability
        FROM users u
        LEFT JOIN therapists_data td ON u.id = td.user_id
        WHERE u.id = :userId AND u.role = 'THERAPIST'
    ");
    $stmt->bindParam(':userId', $userId);
    $stmt->execute();
    $therapist = $stmt->fetch(PDO::FETCH_ASSOC);

    if ($therapist) {
        // Decode JSON fields
        $jsonFields = ['specializations', 'languages', 'qualifications', 'locations', 'availability'];
        foreach ($jsonFields as $field) {
            if (isset($therapist[$field]) && $therapist[$field] !== null) {
                $decoded = json_decode($therapist[$field], true);
                $therapist[$field] = is_array($decoded) ? $decoded : []; 
            } else {
                $therapist[$field] = []; // Default to empty array if field is missing or null
            }
        }
        // Fetch certifications
        $certStmt = $pdo->prepare("SELECT id, name, file_url, country, is_verified_by_admin, verification_notes, uploaded_at FROM certifications WHERE therapist_user_id = :userId ORDER BY uploaded_at DESC");
        $certStmt->bindParam(':userId', $userId);
        $certStmt->execute();
        $therapist['certifications'] = $certStmt->fetchAll(PDO::FETCH_ASSOC);
        
        // Construct membershipApplication object
        $therapist['membershipApplication'] = [
            'date' => $therapist['membership_application_date'],
            'paymentReceiptUrl' => $therapist['membership_payment_receipt_url'],
            'statusMessage' => $therapist['membership_status_message'],
        ];
        unset($therapist['membership_application_date'], $therapist['membership_payment_receipt_url'], $therapist['membership_status_message']);
        
        $therapist['isVerified'] = (bool) ($therapist['is_overall_verified'] ?? false);
        unset($therapist['is_overall_verified']);
    }
    return $therapist;
}


// --- Handle GET Request: Fetch certifications for a therapist ---
if ($method === 'GET') {
    $therapistUserId = $_GET['therapist_user_id'] ?? null;

    if (empty($therapistUserId)) {
        sendJsonResponse(['status' => 'error', 'message' => 'Therapist user ID is required.'], 400);
    }

    try {
        $stmt = $pdo->prepare("SELECT id, name, file_url, country, is_verified_by_admin, verification_notes, uploaded_at FROM certifications WHERE therapist_user_id = :therapist_user_id ORDER BY uploaded_at DESC");
        $stmt->bindParam(':therapist_user_id', $therapistUserId);
        $stmt->execute();
        $certifications = $stmt->fetchAll(PDO::FETCH_ASSOC);

        sendJsonResponse(['status' => 'success', 'certifications' => $certifications], 200);

    } catch (PDOException $e) {
        error_log("Database error fetching certifications: " . $e->getMessage());
        sendJsonResponse(['status' => 'error', 'message' => 'Failed to fetch certifications.'], 500);
    }
}

// --- Handle POST Request: Add a new certification ---
elseif ($method === 'POST') {
    $authData = getAuthenticatedUser($jwtKey); // Ensures user is logged in
    $loggedInUserId = $authData['userId'];
    $loggedInUserRole = $authData['role'];

    $input = json_decode(file_get_contents('php://input'), true);
    if (json_last_error() !== JSON_ERROR_NONE) {
        sendJsonResponse(['status' => 'error', 'message' => 'Invalid JSON input.'], 400);
    }

    $therapistIdInPayload = trim($input['therapistId'] ?? '');
    $name = trim($input['name'] ?? '');
    $fileUrl = filter_var(trim($input['fileUrl'] ?? ''), FILTER_SANITIZE_URL);
    $country = isset($input['country']) ? trim($input['country']) : null;

    // Authorization: Only the therapist themselves can add to their profile.
    if ($loggedInUserRole !== 'THERAPIST' || $loggedInUserId !== $therapistIdInPayload) {
        sendJsonResponse(['status' => 'error', 'message' => 'Unauthorized to add certification to this profile.'], 403);
    }
    if (empty($name) || empty($fileUrl) || empty($therapistIdInPayload)) {
        sendJsonResponse(['status' => 'error', 'message' => 'Therapist ID, certification name, and file URL are required.'], 400);
    }
    if (!filter_var($fileUrl, FILTER_VALIDATE_URL)) {
        sendJsonResponse(['status' => 'error', 'message' => 'Invalid file URL format.'], 400);
    }


    try {
        $certId = 'cert_' . generateUniqueId(); // From core.php

        $stmt = $pdo->prepare("INSERT INTO certifications (id, therapist_user_id, name, file_url, country, uploaded_at) VALUES (:id, :therapist_user_id, :name, :file_url, :country, NOW())");
        $stmt->bindParam(':id', $certId);
        $stmt->bindParam(':therapist_user_id', $therapistIdInPayload);
        $stmt->bindParam(':name', $name);
        $stmt->bindParam(':file_url', $fileUrl);
        $stmt->bindParam(':country', $country);

        if ($stmt->execute()) {
            $updatedTherapistProfile = fetchFullTherapistProfile($therapistIdInPayload, $pdo);
            sendJsonResponse(['status' => 'success', 'message' => 'Certification added successfully.', 'therapist' => $updatedTherapistProfile], 201);
        } else {
            error_log("Failed to insert certification for therapist ID: " . $therapistIdInPayload);
            sendJsonResponse(['status' => 'error', 'message' => 'Failed to add certification.'], 500);
        }
    } catch (PDOException $e) {
        error_log("Database error adding certification: " . $e->getMessage());
        sendJsonResponse(['status' => 'error', 'message' => 'A server error occurred while adding certification.'], 500);
    }
}

// --- Handle PUT Request: Update a certification (primarily for Admin verification) ---
elseif ($method === 'PUT') {
    $authData = getAuthenticatedUser($jwtKey);
    $loggedInUserId = $authData['userId'];
    $loggedInUserRole = $authData['role'];

    $input = json_decode(file_get_contents('php://input'), true);
    if (json_last_error() !== JSON_ERROR_NONE || !isset($input['id'])) {
        sendJsonResponse(['status' => 'error', 'message' => 'Invalid JSON input or missing certification ID.'], 400);
    }

    $certId = trim($input['id']);
    // Fields updatable by Admin
    $isVerifiedByAdminInput = $input['isVerifiedByAdmin'] ?? null; // Expect boolean
    $verificationNotes = isset($input['verificationNotes']) ? trim($input['verificationNotes']) : null; // Allow empty string
    // Fields updatable by Therapist (or Admin)
    $name = isset($input['name']) ? trim($input['name']) : null;
    $country = isset($input['country']) ? trim($input['country']) : null;


    if (empty($certId)) {
        sendJsonResponse(['status' => 'error', 'message' => 'Certification ID is required.'], 400);
    }

    try {
        // Fetch the certification to get therapist_user_id and check ownership if not admin
        $stmtFetch = $pdo->prepare("SELECT therapist_user_id FROM certifications WHERE id = :id");
        $stmtFetch->bindParam(':id', $certId);
        $stmtFetch->execute();
        $certification = $stmtFetch->fetch(PDO::FETCH_ASSOC);

        if (!$certification) {
            sendJsonResponse(['status' => 'error', 'message' => 'Certification not found.'], 404);
        }
        $therapistOwnerId = $certification['therapist_user_id'];

        // Authorization
        $canUpdateAdminFields = ($loggedInUserRole === 'ADMIN');
        $canUpdateGeneralFields = ($loggedInUserRole === 'ADMIN' || ($loggedInUserRole === 'THERAPIST' && $loggedInUserId === $therapistOwnerId));

        if (!$canUpdateGeneralFields && ($name !== null || $country !== null)) {
            sendJsonResponse(['status' => 'error', 'message' => 'Unauthorized to update general fields of this certification.'], 403);
        }
        if (!$canUpdateAdminFields && ($isVerifiedByAdminInput !== null || $verificationNotes !== null)) {
             sendJsonResponse(['status' => 'error', 'message' => 'Unauthorized to update verification status of this certification.'], 403);
        }


        $updateFields = [];
        $params = [':id' => $certId];

        if ($name !== null && $canUpdateGeneralFields) { $updateFields[] = "name = :name"; $params[':name'] = $name; }
        if ($country !== null && $canUpdateGeneralFields) { $updateFields[] = "country = :country"; $params[':country'] = $country; }
        
        if ($isVerifiedByAdminInput !== null && $canUpdateAdminFields) {
            $updateFields[] = "is_verified_by_admin = :is_verified_by_admin";
            $params[':is_verified_by_admin'] = (bool)$isVerifiedByAdminInput; // Cast to boolean
        }
        if ($verificationNotes !== null && $canUpdateAdminFields) { // Allow setting notes to empty string
            $updateFields[] = "verification_notes = :verification_notes";
            $params[':verification_notes'] = $verificationNotes;
        }


        if (count($updateFields) === 0) {
            sendJsonResponse(['status' => 'success', 'message' => 'No changes detected for certification.'], 200);
        }

        $sql = "UPDATE certifications SET " . implode(", ", $updateFields) . " WHERE id = :id";
        $stmtUpdate = $pdo->prepare($sql);

        if ($stmtUpdate->execute($params)) {
            $updatedTherapistProfile = fetchFullTherapistProfile($therapistOwnerId, $pdo);
            sendJsonResponse(['status' => 'success', 'message' => 'Certification updated successfully.', 'therapist' => $updatedTherapistProfile], 200);
        } else {
            error_log("Failed to update certification ID: " . $certId);
            sendJsonResponse(['status' => 'error', 'message' => 'Failed to update certification.'], 500);
        }

    } catch (PDOException $e) {
        error_log("Database error updating certification: " . $e->getMessage());
        sendJsonResponse(['status' => 'error', 'message' => 'A server error occurred while updating certification.'], 500);
    }
}

// --- Handle DELETE Request: Delete a certification ---
elseif ($method === 'DELETE') {
    $authData = getAuthenticatedUser($jwtKey);
    $loggedInUserId = $authData['userId'];
    $loggedInUserRole = $authData['role'];

    $input = json_decode(file_get_contents('php://input'), true);
    if (json_last_error() !== JSON_ERROR_NONE || !isset($input['certId'])) { // Changed from id to certId to be more specific
        sendJsonResponse(['status' => 'error', 'message' => 'Invalid JSON input or missing certId.'], 400);
    }

    $certIdToDelete = trim($input['certId']);
    // $therapistIdFromPayload = trim($input['therapistId'] ?? ''); // Optionally passed for verification

    if (empty($certIdToDelete)) {
        sendJsonResponse(['status' => 'error', 'message' => 'Certification ID is required.'], 400);
    }

    try {
        // Fetch the certification to get therapist_user_id for authorization and returning full profile
        $stmtFetch = $pdo->prepare("SELECT therapist_user_id FROM certifications WHERE id = :id");
        $stmtFetch->bindParam(':id', $certIdToDelete);
        $stmtFetch->execute();
        $certification = $stmtFetch->fetch(PDO::FETCH_ASSOC);

        if (!$certification) {
            sendJsonResponse(['status' => 'error', 'message' => 'Certification not found.'], 404);
        }
        $therapistOwnerId = $certification['therapist_user_id'];

        // Authorization check
        if ($loggedInUserRole !== 'ADMIN' && ($loggedInUserRole !== 'THERAPIST' || $loggedInUserId !== $therapistOwnerId)) {
            sendJsonResponse(['status' => 'error', 'message' => 'Unauthorized to delete this certification.'], 403);
        }

        $stmtDelete = $pdo->prepare("DELETE FROM certifications WHERE id = :id");
        $stmtDelete->bindParam(':id', $certIdToDelete);

        if ($stmtDelete->execute()) {
            // Note: This does not delete the actual file from server storage.
            // File deletion logic would need to be implemented separately if required,
            // possibly involving parsing the file_url and unlinking the file.
            $updatedTherapistProfile = fetchFullTherapistProfile($therapistOwnerId, $pdo);
            sendJsonResponse(['status' => 'success', 'message' => 'Certification deleted successfully.', 'therapist' => $updatedTherapistProfile], 200);
        } else {
            error_log("Failed to delete certification ID: " . $certIdToDelete);
            sendJsonResponse(['status' => 'error', 'message' => 'Failed to delete certification.'], 500);
        }

    } catch (PDOException $e) {
        error_log("Database error deleting certification: " . $e->getMessage());
        sendJsonResponse(['status' => 'error', 'message' => 'A server error occurred while deleting certification.'], 500);
    }
}

// --- Invalid Method ---
else {
    sendJsonResponse(['status' => 'error', 'message' => 'Invalid request method.'], 405);
}
?>