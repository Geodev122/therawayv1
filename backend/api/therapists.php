<?php
// backend/api/therapist_profile.php

declare(strict_types=1);
ini_set('display_errors', '0');
error_reporting(E_ALL);

require_once __DIR__ . '/../config/core.php';
require_once __DIR__ . '/../config/db.php'; // Provides $pdo
require_once __DIR__ . '/../vendor/autoload.php';

use Firebase\JWT\JWT;
use Firebase\JWT\Key;
use Firebase\JWT\ExpiredException;
use Firebase\JWT\SignatureInvalidException;
use Firebase\JWT\BeforeValidException;

handleCors(); // From core.php

$method = strtoupper($_SERVER['REQUEST_METHOD']);
$jwtKey = defined('JWT_SECRET_KEY') ? JWT_SECRET_KEY : null;

/**
 * Helper function to get authenticated user ID and role from JWT.
 * Sends error response and exits if authentication fails.
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
        error_log("JWT Decode Error: " . $e->getMessage());
        sendJsonResponse(['status' => 'error', 'message' => 'Invalid token: ' . $e->getMessage()], 401);
    }
    exit; // Should not reach here if sendJsonResponse exits
}


if ($method === 'GET') {
    $userIdToFetch = $_GET['userId'] ?? null;

    if (empty($userIdToFetch)) {
        sendJsonResponse(['status' => 'error', 'message' => 'User ID is required to fetch therapist profile.'], 400);
    }

    try {
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
            JOIN therapists_data td ON u.id = td.user_id
            WHERE u.id = :userId AND u.role = 'THERAPIST'
        ");
        $stmt->bindParam(':userId', $userIdToFetch);
        $stmt->execute();
        $therapist = $stmt->fetch(PDO::FETCH_ASSOC);

        if ($therapist) {
            // Decode JSON fields
            $jsonFields = ['specializations', 'languages', 'qualifications', 'locations', 'availability'];
            foreach ($jsonFields as $field) {
                if (isset($therapist[$field])) {
                    $decoded = json_decode($therapist[$field], true);
                    // Ensure it's an array, even if JSON was null or invalid
                    $therapist[$field] = is_array($decoded) ? $decoded : []; 
                } else {
                    $therapist[$field] = []; // Default to empty array if field is missing
                }
            }

            // Fetch certifications separately
            $certStmt = $pdo->prepare("SELECT id, name, file_url, country, is_verified_by_admin, verification_notes, uploaded_at FROM certifications WHERE therapist_user_id = :userId ORDER BY uploaded_at DESC");
            $certStmt->bindParam(':userId', $userIdToFetch);
            $certStmt->execute();
            $therapist['certifications'] = $certStmt->fetchAll(PDO::FETCH_ASSOC);
            
            // Construct membershipApplication object for frontend compatibility
            $therapist['membershipApplication'] = [
                'date' => $therapist['membership_application_date'],
                'paymentReceiptUrl' => $therapist['membership_payment_receipt_url'],
                'statusMessage' => $therapist['membership_status_message'],
            ];
            // Clean up individual membership fields if they are now in the object
            unset($therapist['membership_application_date']);
            unset($therapist['membership_payment_receipt_url']);
            unset($therapist['membership_status_message']);

            // Rename is_overall_verified to isVerified for frontend
            $therapist['isVerified'] = (bool) ($therapist['is_overall_verified'] ?? false);
            unset($therapist['is_overall_verified']);


            sendJsonResponse(['status' => 'success', 'therapist' => $therapist], 200);
        } else {
            sendJsonResponse(['status' => 'not_found', 'message' => 'Therapist profile not found or user is not a therapist.'], 404);
        }

    } catch (PDOException $e) {
        error_log("Database error fetching therapist profile: " . $e->getMessage());
        sendJsonResponse(['status' => 'error', 'message' => 'A server error occurred.'], 500);
    }

} elseif ($method === 'PUT') {
    if (!$jwtKey) {
        sendJsonResponse(['status' => 'error', 'message' => 'Server JWT configuration missing.'], 500);
    }
    $authData = getAuthenticatedUser($jwtKey);
    $loggedInUserId = $authData['userId'];
    $loggedInUserRole = $authData['role'];

    $input = json_decode(file_get_contents('php://input'), true);

    if (json_last_error() !== JSON_ERROR_NONE || !isset($input['id'])) {
        sendJsonResponse(['status' => 'error', 'message' => 'Invalid JSON input or missing therapist ID.'], 400);
    }

    $therapistIdToUpdate = $input['id'];

    // Authorization: Only the therapist themself or an ADMIN can update the profile.
    if ($loggedInUserId !== $therapistIdToUpdate && $loggedInUserRole !== 'ADMIN') {
        sendJsonResponse(['status' => 'error', 'message' => 'Unauthorized to update this profile.'], 403);
    }

    // Fields that can be updated in users table by THERAPIST/ADMIN (limited)
    $userName = isset($input['name']) ? trim($input['name']) : null;
    $userProfilePictureUrl = isset($input['profilePictureUrl']) ? trim($input['profilePictureUrl']) : null;
    // Email change is more complex (verification needed), typically handled in a separate "account settings" section.

    // Fields for therapists_data table
    $bio = $input['bio'] ?? null;
    $whatsappNumber = isset($input['whatsappNumber']) ? preg_replace('/[^\d+]/', '', $input['whatsappNumber']) : null; // Sanitize WhatsApp number
    $introVideoUrl = isset($input['introVideoUrl']) ? trim($input['introVideoUrl']) : null;
    
    $specializations = isset($input['specializations']) && is_array($input['specializations']) ? json_encode($input['specializations']) : null;
    $languages = isset($input['languages']) && is_array($input['languages']) ? json_encode($input['languages']) : null;
    $qualifications = isset($input['qualifications']) && is_array($input['qualifications']) ? json_encode($input['qualifications']) : null;
    $locations = isset($input['locations']) && is_array($input['locations']) ? json_encode($input['locations']) : null; // Ensure locations are validated (e.g., primary exists)
    $availability = isset($input['availability']) && is_array($input['availability']) ? json_encode($input['availability']) : null;

    // Fields usually updated by ADMIN only (or specific membership flows)
    $accountStatus = ($loggedInUserRole === 'ADMIN' && isset($input['accountStatus'])) ? $input['accountStatus'] : null;
    $adminNotes = ($loggedInUserRole === 'ADMIN' && isset($input['adminNotes'])) ? $input['adminNotes'] : null;
    $isOverallVerified = ($loggedInUserRole === 'ADMIN' && isset($input['isVerified'])) ? (bool)$input['isVerified'] : null;


    // Basic validation (more can be added)
    if ($userName === '') sendJsonResponse(['status' => 'error', 'message' => 'Name cannot be empty.'], 400);
    if ($bio === '') sendJsonResponse(['status' => 'error', 'message' => 'Bio cannot be empty.'], 400);

    try {
        $pdo->beginTransaction();

        // 1. Update users table (name, profilePictureUrl)
        $userUpdateFields = [];
        $userParams = [':id' => $therapistIdToUpdate];
        if ($userName !== null) { $userUpdateFields[] = "name = :name"; $userParams[':name'] = $userName; }
        if ($userProfilePictureUrl !== null) { $userUpdateFields[] = "profile_picture_url = :profile_picture_url"; $userParams[':profile_picture_url'] = $userProfilePictureUrl; }

        if (count($userUpdateFields) > 0) {
            $userSql = "UPDATE users SET " . implode(", ", $userUpdateFields) . " WHERE id = :id AND role = 'THERAPIST'";
            $stmtUser = $pdo->prepare($userSql);
            $stmtUser->execute($userParams);
        }

        // 2. Update therapists_data table
        $therapistDataFields = [];
        $therapistDataParams = [':user_id' => $therapistIdToUpdate];

        if ($bio !== null) { $therapistDataFields[] = "bio = :bio"; $therapistDataParams[':bio'] = $bio; }
        if ($whatsappNumber !== null) { $therapistDataFields[] = "whatsapp_number = :whatsapp_number"; $therapistDataParams[':whatsapp_number'] = $whatsappNumber; }
        if ($introVideoUrl !== null) { $therapistDataFields[] = "intro_video_url = :intro_video_url"; $therapistDataParams[':intro_video_url'] = $introVideoUrl; }
        if ($specializations !== null) { $therapistDataFields[] = "specializations = :specializations"; $therapistDataParams[':specializations'] = $specializations; }
        if ($languages !== null) { $therapistDataFields[] = "languages = :languages"; $therapistDataParams[':languages'] = $languages; }
        if ($qualifications !== null) { $therapistDataFields[] = "qualifications = :qualifications"; $therapistDataParams[':qualifications'] = $qualifications; }
        if ($locations !== null) { $therapistDataFields[] = "locations = :locations"; $therapistDataParams[':locations'] = $locations; }
        if ($availability !== null) { $therapistDataFields[] = "availability = :availability"; $therapistDataParams[':availability'] = $availability; }

        // Admin-only updatable fields for therapists_data
        if ($loggedInUserRole === 'ADMIN') {
            if ($accountStatus !== null && in_array($accountStatus, ['draft', 'pending_approval', 'live', 'rejected'])) {
                $therapistDataFields[] = "account_status = :account_status";
                $therapistDataParams[':account_status'] = $accountStatus;
            }
            if ($adminNotes !== null) { // Allow setting to empty string to clear notes
                 $therapistDataFields[] = "admin_notes = :admin_notes"; $therapistDataParams[':admin_notes'] = $adminNotes;
            }
            if ($isOverallVerified !== null) {
                 $therapistDataFields[] = "is_overall_verified = :is_overall_verified"; $therapistDataParams[':is_overall_verified'] = $isOverallVerified;
            }
        }
        
        if (count($therapistDataFields) > 0) {
            // Check if therapist_data entry exists, if not, create it (edge case, should exist after signup)
            $checkStmt = $pdo->prepare("SELECT 1 FROM therapists_data WHERE user_id = :user_id");
            $checkStmt->execute([':user_id' => $therapistIdToUpdate]);
            if (!$checkStmt->fetch()) {
                // Create a new entry if it somehow doesn't exist (e.g., initial signup flow missed it)
                $insertSql = "INSERT INTO therapists_data (user_id, " . implode(", ", array_map(fn($f) => explode(" = ", $f)[0], $therapistDataFields)) . ") 
                              VALUES (:user_id, :" . implode(", :", array_map(fn($f) => explode(" = ", $f)[0], $therapistDataFields)) . ")";
                $stmtTherapistData = $pdo->prepare($insertSql);
            } else {
                $therapistDataSql = "UPDATE therapists_data SET " . implode(", ", $therapistDataFields) . " WHERE user_id = :user_id";
                $stmtTherapistData = $pdo->prepare($therapistDataSql);
            }
            $stmtTherapistData->execute($therapistDataParams);
        }
        
        $pdo->commit();

        // Fetch the updated therapist profile to return
        $stmtFetchUpdated = $pdo->prepare("
            SELECT 
                u.id, u.name, u.email, u.profile_picture_url,
                td.bio, td.whatsapp_number, td.intro_video_url, td.account_status,
                td.admin_notes, td.membership_application_date, td.membership_payment_receipt_url,
                td.membership_status_message, td.membership_renewal_date,
                td.specializations, td.languages, td.qualifications, td.locations,
                td.rating, td.review_count, td.profile_views, td.likes_count,
                td.is_overall_verified, td.availability
            FROM users u
            JOIN therapists_data td ON u.id = td.user_id
            WHERE u.id = :userId
        ");
        $stmtFetchUpdated->bindParam(':userId', $therapistIdToUpdate);
        $stmtFetchUpdated->execute();
        $updatedTherapist = $stmtFetchUpdated->fetch(PDO::FETCH_ASSOC);

        if ($updatedTherapist) {
             // Decode JSON fields for the response
            $jsonFields = ['specializations', 'languages', 'qualifications', 'locations', 'availability'];
            foreach ($jsonFields as $field) {
                if (isset($updatedTherapist[$field])) {
                    $decoded = json_decode($updatedTherapist[$field], true);
                    $updatedTherapist[$field] = is_array($decoded) ? $decoded : [];
                } else {
                     $updatedTherapist[$field] = [];
                }
            }
            $updatedTherapist['isVerified'] = (bool) ($updatedTherapist['is_overall_verified'] ?? false);
            unset($updatedTherapist['is_overall_verified']);
            $updatedTherapist['membershipApplication'] = [
                'date' => $updatedTherapist['membership_application_date'],
                'paymentReceiptUrl' => $updatedTherapist['membership_payment_receipt_url'],
                'statusMessage' => $updatedTherapist['membership_status_message'],
            ];
             unset($updatedTherapist['membership_application_date']);
             unset($updatedTherapist['membership_payment_receipt_url']);
             unset($updatedTherapist['membership_status_message']);

            sendJsonResponse(['status' => 'success', 'message' => 'Therapist profile updated successfully.', 'therapist' => $updatedTherapist], 200);
        } else {
            // This should ideally not happen if the initial check for therapist existence passed
            sendJsonResponse(['status' => 'error', 'message' => 'Failed to retrieve updated therapist profile.'], 500);
        }

    } catch (PDOException $e) {
        $pdo->rollBack();
        error_log("Database error updating therapist profile: " . $e->getMessage());
        sendJsonResponse(['status' => 'error', 'message' => 'A server error occurred while updating the profile.'], 500);
    }

} else {
    sendJsonResponse(['status' => 'error', 'message' => 'Invalid request method.'], 405);
}
?>