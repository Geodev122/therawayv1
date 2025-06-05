<?php
// backend/api/user_profile.php

declare(strict_types=1);
// Error display and reporting levels are now primarily controlled by core.php based on ENVIRONMENT
// ini_set('display_errors', '0');
// error_reporting(E_ALL);

// --- Includes ---
// core.php MUST include helpers.php for this script to work as intended
require_once __DIR__ . '/../config/core.php';   // Defines constants, includes helpers.php
require_once __DIR__ . '/../config/db.php';       // Provides $pdo database connection
require_once __DIR__ . '/../vendor/autoload.php'; // Composer autoloader (for JWT library if used directly)

// JWT classes might be used by helpers, direct 'use' here is usually not needed
// use Firebase\JWT\JWT;
// use Firebase\JWT\Key;

// --- CORS Handling ---
handleCors(); // This function is now available from helpers.php (via core.php)

// --- Request Method Check ---
$method = strtoupper($_SERVER['REQUEST_METHOD']);
// JWT_SECRET_KEY constant is used by getAuthenticatedUser() from helpers.php

// --- Handle GET Request: Fetch authenticated user's profile ---
if ($method === 'GET') {
    // getAuthenticatedUser (from helpers.php) handles:
    // - Token extraction from Authorization header
    // - Token validation (signature, expiration)
    // - Exiting with error (using sendJsonResponse) if auth fails.
    // - No specific $allowedRoles passed, so it allows any authenticated user.
    $authData = getAuthenticatedUser(); // Relies on JWT_SECRET_KEY constant from core.php
    $loggedInUserId = $authData['userId'];

    try {
        $stmt = $pdo->prepare("SELECT id, name, email, role, profile_picture_url FROM users WHERE id = :id");
        $stmt->bindParam(':id', $loggedInUserId);
        $stmt->execute();
        $user = $stmt->fetch(PDO::FETCH_ASSOC);

        if ($user) {
            // Ensure profilePictureUrl is a string or null for consistency with frontend type
            $user['profilePictureUrl'] = $user['profile_picture_url'] ?? null;
            sendJsonResponse(['status' => 'success', 'user' => $user], 200);
        } else {
            // This case should be rare if getAuthenticatedUser succeeded, as it implies a valid token for a non-existent user.
            error_log("User not found in DB after successful JWT auth. UserID: " . $loggedInUserId);
            sendJsonResponse(['status' => 'error', 'message' => 'User not found.'], 404);
        }
    } catch (PDOException $e) {
        error_log("Database error fetching user profile (GET for user {$loggedInUserId}): " . $e->getMessage());
        sendJsonResponse(['status' => 'error', 'message' => 'A server error occurred while fetching profile.'], 500);
    }
}

// --- Handle PUT Request: Update authenticated user's profile ---
elseif ($method === 'PUT') {
    $authData = getAuthenticatedUser(); // Authenticate the user making the request
    $loggedInUserId = $authData['userId'];

    $input = json_decode(file_get_contents('php://input'), true);

    if (json_last_error() !== JSON_ERROR_NONE) {
        sendJsonResponse(['status' => 'error', 'message' => 'Invalid JSON input.'], 400);
    }

    // Fields that can be updated
    $name = isset($input['name']) ? trim($input['name']) : null;
    $emailInput = isset($input['email']) ? filter_var(trim($input['email']), FILTER_SANITIZE_EMAIL) : null;
    $profilePictureUrl = isset($input['profilePictureUrl']) ? filter_var(trim($input['profilePictureUrl']), FILTER_SANITIZE_URL) : null;

    // Optional: Verify payload userId matches authenticated user if provided (as seen in ClientProfilePage)
    $userIdFromPayload = $input['userId'] ?? null;
    if ($userIdFromPayload && $userIdFromPayload !== $loggedInUserId) {
        sendJsonResponse(['status' => 'error', 'message' => 'User ID mismatch. Cannot update another user\'s profile.'], 403);
    }

    $updateFields = [];
    $params = [':id' => $loggedInUserId]; // Use :id for the WHERE clause

    if ($name !== null) {
        if (empty($name)) { // Basic validation
            sendJsonResponse(['status' => 'error', 'message' => 'Name cannot be empty.'], 400);
        }
        $updateFields[] = "name = :name_val"; // Use a different placeholder name
        $params[':name_val'] = $name;
    }

    if ($emailInput !== null) {
        if (!filter_var($emailInput, FILTER_VALIDATE_EMAIL)) {
            sendJsonResponse(['status' => 'error', 'message' => 'Invalid email format.'], 400);
        }
        // Check if the new email is already taken by ANOTHER user
        $stmtCheckEmail = $pdo->prepare("SELECT id FROM users WHERE email = :email AND id != :current_user_id");
        $stmtCheckEmail->bindParam(':email', $emailInput);
        $stmtCheckEmail->bindParam(':current_user_id', $loggedInUserId);
        $stmtCheckEmail->execute();
        if ($stmtCheckEmail->fetch()) {
            sendJsonResponse(['status' => 'error', 'message' => 'Email address is already in use by another account.'], 409); // Conflict
        }
        $updateFields[] = "email = :email_val"; // Use a different placeholder name
        $params[':email_val'] = $emailInput;
        // NOTE: A real-world email change should trigger a re-verification process (not implemented here).
    }

    if ($profilePictureUrl !== null) { // Allows setting to empty string or null to remove picture
        if ($profilePictureUrl !== '' && !filter_var($profilePictureUrl, FILTER_VALIDATE_URL)) {
            // Allow relative paths from upload.php (e.g. /backend/uploads/...)
             if (!preg_match('/^\/backend\/uploads\/.+$/', $profilePictureUrl) && !preg_match('/^https?:\/\/.+$/', $profilePictureUrl) ) { // Allow full URLs too
                 sendJsonResponse(['status' => 'error', 'message' => 'Invalid profile picture URL format. Must be a valid URL or a server path starting with /backend/uploads/.'], 400);
            }
        }
        $updateFields[] = "profile_picture_url = :profile_picture_url_val"; // Use a different placeholder name
        $params[':profile_picture_url_val'] = ($profilePictureUrl === '') ? null : $profilePictureUrl;
    }


    if (count($updateFields) === 0) {
        // If no fields to update, fetch current user data and return that
        $stmtCurrent = $pdo->prepare("SELECT id, name, email, role, profile_picture_url FROM users WHERE id = :id");
        $stmtCurrent->bindParam(':id', $loggedInUserId);
        $stmtCurrent->execute();
        $currentUser = $stmtCurrent->fetch(PDO::FETCH_ASSOC);
        if ($currentUser) {
             $currentUser['profilePictureUrl'] = $currentUser['profile_picture_url'] ?? null;
        }
        sendJsonResponse(['status' => 'success', 'message' => 'No changes detected.', 'user' => $currentUser ?: null], 200);
    }
    
    // Add updated_at timestamp to the update query
    $updateFields[] = "updated_at = NOW()";

    $sql = "UPDATE users SET " . implode(", ", $updateFields) . " WHERE id = :id";

    try {
        $stmtUpdate = $pdo->prepare($sql);
        if ($stmtUpdate->execute($params)) {
            // Fetch the updated user profile to return
            $stmtUpdated = $pdo->prepare("SELECT id, name, email, role, profile_picture_url FROM users WHERE id = :id");
            $stmtUpdated->bindParam(':id', $loggedInUserId);
            $stmtUpdated->execute();
            $updatedUser = $stmtUpdated->fetch(PDO::FETCH_ASSOC);
            if ($updatedUser) {
                $updatedUser['profilePictureUrl'] = $updatedUser['profile_picture_url'] ?? null;
            }

            sendJsonResponse(['status' => 'success', 'message' => 'Profile updated successfully.', 'user' => $updatedUser], 200);
        } else {
            error_log("Failed to update user profile for ID: " . $loggedInUserId);
            sendJsonResponse(['status' => 'error', 'message' => 'Failed to update profile.'], 500);
        }
    } catch (PDOException $e) {
        error_log("Database error updating user profile (PUT for user {$loggedInUserId}): " . $e->getMessage());
        sendJsonResponse(['status' => 'error', 'message' => 'A server error occurred while updating profile.'], 500);
    }
}

// --- Handle POST Request (for actions like password change, account deletion - Conceptual) ---
elseif ($method === 'POST') {
    // This section remains conceptual as these require more complex logic (e.g., current password verification, email confirmations)
    $authData = getAuthenticatedUser();
    $loggedInUserId = $authData['userId'];
    $input = json_decode(file_get_contents('php://input'), true);
    $action = $input['action'] ?? null;

    if ($action === 'change_password') {
        // Required: currentPassword, newPassword
        // Full logic:
        // 1. Fetch user's current password_hash from DB.
        // 2. Verify $input['currentPassword'] against the stored hash using password_verify().
        // 3. If verified, hash $input['newPassword'] using password_hash().
        // 4. Update user's password_hash in DB.
        // 5. Optionally, log out other sessions or send a notification.
        sendJsonResponse(['status' => 'info', 'message' => 'Password change feature not fully implemented in this basic script.'], 501); // Not Implemented
    } elseif ($action === 'request_deletion') {
        // Full logic:
        // 1. Maybe log the request for admin review.
        // 2. Send confirmation email to user.
        // 3. Actual deletion might be a soft delete (mark as inactive) or an admin-approved permanent process.
        // 4. Consider data anonymization or what happens to related records.
        sendJsonResponse(['status' => 'info', 'message' => 'Account deletion request feature not fully implemented.'], 501); // Not Implemented
    } else {
        sendJsonResponse(['status' => 'error', 'message' => 'Invalid action for POST request.'], 400);
    }
}

// --- Invalid Method ---
else {
    sendJsonResponse(['status' => 'error', 'message' => 'Invalid request method for user profile.'], 405);
}
?>