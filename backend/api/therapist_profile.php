<?php
// backend/api/therapist_profile.php

declare(strict_types=1);
ini_set('display_errors', '0'); // Log errors, don't display in API output
error_reporting(E_ALL);

try { // Global try-catch block to handle any unhandled errors
    // --- Includes ---
    require_once __DIR__ . '/../config/core.php'; // This now includes helpers.php
    require_once __DIR__ . '/../config/db.php';   // Provides $pdo
    require_once __DIR__ . '/../vendor/autoload.php'; // Composer autoloader

    use Firebase\JWT\JWT; // Still needed for direct use if any, though helpers encapsulate most
    use Firebase\JWT\Key;

    // --- CORS Handling ---
    handleCors(); // From helpers.php (via core.php)

    // --- Request Method & JWT Key ---
    $method = strtoupper($_SERVER['REQUEST_METHOD']);
    $jwtKey = defined('JWT_SECRET_KEY') ? JWT_SECRET_KEY : null; // Used by getAuthenticatedUser from helpers

    // --- Handle GET Request: Fetch therapist profile ---
    if ($method === 'GET') {
        $userIdToFetch = $_GET['userId'] ?? null;

        if (empty($userIdToFetch)) {
            sendJsonResponse(['status' => 'error', 'message' => 'User ID is required to fetch therapist profile.'], 400);
        }

        try {
            // Uses the fetchFullTherapistProfile helper function
            $therapistProfile = fetchFullTherapistProfile($userIdToFetch, $pdo);

            if ($therapistProfile) {
                sendJsonResponse(['status' => 'success', 'therapist' => $therapistProfile], 200);
            } else {
                sendJsonResponse(['status' => 'not_found', 'message' => 'Therapist profile not found or user is not a therapist.'], 404);
            }

        } catch (PDOException $e) {
            error_log("Database error fetching therapist profile (GET): " . $e->getMessage());
            sendJsonResponse(['status' => 'error', 'message' => 'A server error occurred while fetching the profile.'], 500);
        }
    }

    // --- Handle PUT Request: Update therapist profile ---
    elseif ($method === 'PUT') {
        if (!$jwtKey) { // Should be caught by getAuthenticatedUser, but good check
            sendJsonResponse(['status' => 'error', 'message' => 'Server JWT configuration missing.'], 500);
        }
        // Uses getAuthenticatedUser helper. Allows any authenticated user initially, then checks role.
        $authData = getAuthenticatedUser($jwtKey, ['THERAPIST', 'ADMIN']);
        $loggedInUserId = $authData['userId'];
        $loggedInUserRole = $authData['role'];

        $input = json_decode(file_get_contents('php://input'), true);

        if (json_last_error() !== JSON_ERROR_NONE || !isset($input['id'])) {
            sendJsonResponse(['status' => 'error', 'message' => 'Invalid JSON input or missing therapist ID (user ID).'], 400);
        }

        $therapistIdToUpdate = $input['id']; // This is the user_id of the therapist being updated

        // Authorization: Only the therapist themself or an ADMIN can update the profile.
        if ($loggedInUserRole === 'THERAPIST' && $loggedInUserId !== $therapistIdToUpdate) {
            sendJsonResponse(['status' => 'error', 'message' => 'Unauthorized: Therapists can only update their own profile.'], 403);
        }
        // Admins can update any therapist profile.

        // --- Prepare fields for update ---
        // Fields from `users` table (can be updated by therapist or admin)
        $userName = isset($input['name']) ? trim($input['name']) : null;
        $userProfilePictureUrl = isset($input['profilePictureUrl']) ? filter_var(trim($input['profilePictureUrl']), FILTER_SANITIZE_URL) : null;
        // Note: Email change is complex (requires verification) and typically handled in a separate "account settings" flow.
        // We are NOT handling email changes here to keep it simpler for profile updates.

        // Fields from `therapists_data` table
        $bio = isset($input['bio']) ? trim($input['bio']) : null;
        $whatsappNumber = isset($input['whatsappNumber']) ? preg_replace('/[^\d+]/', '', $input['whatsappNumber']) : null;
        $introVideoUrl = isset($input['introVideoUrl']) ? filter_var(trim($input['introVideoUrl']), FILTER_SANITIZE_URL) : null;
        
        // JSON fields - ensure they are arrays before encoding
        $specializations = isset($input['specializations']) && is_array($input['specializations']) ? json_encode($input['specializations']) : null;
        $languages = isset($input['languages']) && is_array($input['languages']) ? json_encode($input['languages']) : null;
        $qualifications = isset($input['qualifications']) && is_array($input['qualifications']) ? json_encode($input['qualifications']) : null;
        $locations = isset($input['locations']) && is_array($input['locations']) ? json_encode($input['locations']) : null;
        $availability = isset($input['availability']) && is_array($input['availability']) ? json_encode($input['availability']) : null;

        // Fields typically updated by ADMIN only (or specific membership flows not handled here)
        $accountStatus = ($loggedInUserRole === 'ADMIN' && isset($input['accountStatus'])) ? $input['accountStatus'] : null;
        $adminNotes = ($loggedInUserRole === 'ADMIN' && array_key_exists('adminNotes', $input)) ? trim($input['adminNotes']) : null; // Allow empty string
        $isOverallVerifiedInput = ($loggedInUserRole === 'ADMIN' && isset($input['isVerified'])) ? $input['isVerified'] : null; // Frontend sends 'isVerified'

        // Basic validation
        if (isset($input['name']) && empty($input['name'])) sendJsonResponse(['status' => 'error', 'message' => 'Name cannot be empty.'], 400);
        // Add more specific validations as needed for other fields

        try {
            $pdo->beginTransaction();

            // 1. Update `users` table (name, profile_picture_url)
            $userUpdateFields = [];
            $userParams = [':id' => $therapistIdToUpdate];
            if ($userName !== null) { $userUpdateFields[] = "name = :name"; $userParams[':name'] = $userName; }
            if ($userProfilePictureUrl !== null) { $userUpdateFields[] = "profile_picture_url = :profile_picture_url"; $userParams[':profile_picture_url'] = $userProfilePictureUrl; }

            if (count($userUpdateFields) > 0) {
                $userUpdateFields[] = "updated_at = NOW()";
                $userSql = "UPDATE users SET " . implode(", ", $userUpdateFields) . " WHERE id = :id AND role = 'THERAPIST'";
                $stmtUser = $pdo->prepare($userSql);
                $stmtUser->execute($userParams);
            }

            // 2. Update `therapists_data` table
            $therapistDataUpdateFields = [];
            $therapistDataParams = [':user_id' => $therapistIdToUpdate];

            if ($bio !== null) { $therapistDataUpdateFields[] = "bio = :bio"; $therapistDataParams[':bio'] = $bio; }
            if ($whatsappNumber !== null) { $therapistDataUpdateFields[] = "whatsapp_number = :whatsapp_number"; $therapistDataParams[':whatsapp_number'] = $whatsappNumber; }
            if ($introVideoUrl !== null) { $therapistDataUpdateFields[] = "intro_video_url = :intro_video_url"; $therapistDataParams[':intro_video_url'] = $introVideoUrl; }
            if ($specializations !== null) { $therapistDataUpdateFields[] = "specializations = :specializations"; $therapistDataParams[':specializations'] = $specializations; }
            if ($languages !== null) { $therapistDataUpdateFields[] = "languages = :languages"; $therapistDataParams[':languages'] = $languages; }
            if ($qualifications !== null) { $therapistDataUpdateFields[] = "qualifications = :qualifications"; $therapistDataParams[':qualifications'] = $qualifications; }
            if ($locations !== null) { $therapistDataUpdateFields[] = "locations = :locations"; $therapistDataParams[':locations'] = $locations; }
            if ($availability !== null) { $therapistDataUpdateFields[] = "availability = :availability"; $therapistDataParams[':availability'] = $availability; }

            // Admin-only updatable fields for therapists_data
            if ($loggedInUserRole === 'ADMIN') {
                if ($accountStatus !== null && in_array($accountStatus, ['draft', 'pending_approval', 'live', 'rejected'])) {
                    $therapistDataUpdateFields[] = "account_status = :account_status";
                    $therapistDataParams[':account_status'] = $accountStatus;
                }
                if ($adminNotes !== null) { // Allows clearing notes if empty string is sent
                    $therapistDataUpdateFields[] = "admin_notes = :admin_notes"; $therapistDataParams[':admin_notes'] = $adminNotes;
                }
                if ($isOverallVerifiedInput !== null) {
                    $therapistDataUpdateFields[] = "is_overall_verified = :is_overall_verified";
                    $therapistDataParams[':is_overall_verified'] = (bool)$isOverallVerifiedInput;
                }
            }
            
            if (count($therapistDataUpdateFields) > 0) {
                $therapistDataUpdateFields[] = "updated_at = NOW()";
                // Check if therapist_data entry exists, if not, create it (edge case)
                $checkStmt = $pdo->prepare("SELECT 1 FROM therapists_data WHERE user_id = :user_id");
                $checkStmt->execute([':user_id' => $therapistIdToUpdate]);
                if (!$checkStmt->fetch()) {
                    // Build INSERT statement dynamically
                    $insertColumns = ['user_id'];
                    $insertPlaceholders = [':user_id'];
                    foreach ($therapistDataUpdateFields as $fieldAssignment) {
                        if (strpos($fieldAssignment, "updated_at") !== false) continue; // Skip updated_at for insert placeholders
                        $parts = explode(" = ", $fieldAssignment);
                        $column = trim($parts[0]);
                        $placeholder = trim($parts[1]);
                        $insertColumns[] = $column;
                        $insertPlaceholders[] = $placeholder;
                    }
                    $insertSql = "INSERT INTO therapists_data (" . implode(", ", $insertColumns) . ") VALUES (" . implode(", ", $insertPlaceholders) . ")";
                    $stmtTherapistData = $pdo->prepare($insertSql);
                } else {
                    $therapistDataSql = "UPDATE therapists_data SET " . implode(", ", $therapistDataUpdateFields) . " WHERE user_id = :user_id";
                    $stmtTherapistData = $pdo->prepare($therapistDataSql);
                }
                $stmtTherapistData->execute($therapistDataParams);
            }
            
            $pdo->commit();

            // Fetch the updated therapist profile to return using the helper
            $updatedTherapistProfile = fetchFullTherapistProfile($therapistIdToUpdate, $pdo);

            if ($updatedTherapistProfile) {
                sendJsonResponse(['status' => 'success', 'message' => 'Therapist profile updated successfully.', 'therapist' => $updatedTherapistProfile], 200);
            } else {
                // This should ideally not happen if the initial check for therapist existence passed
                sendJsonResponse(['status' => 'error', 'message' => 'Failed to retrieve updated therapist profile.'], 500);
            }

        } catch (PDOException $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            error_log("Database error updating therapist profile (PUT): " . $e->getMessage());
            sendJsonResponse(['status' => 'error', 'message' => 'A server error occurred while updating the profile.'], 500);
        }

    }

    // --- Invalid Method ---
    else {
        sendJsonResponse(['status' => 'error', 'message' => 'Invalid request method for therapist profile.'], 405);
    }
} catch (Throwable $e) {
    // Log the error and send a clean JSON response
    error_log("Unhandled error in therapist_profile.php: " . $e->getMessage());
    error_log("Stack trace: " . $e->getTraceAsString());
    sendJsonResponse(['status' => 'error', 'message' => 'An unexpected error occurred.'], 500);
}
?>