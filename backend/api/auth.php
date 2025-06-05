<?php
// backend/api/auth.php

declare(strict_types=1);
// Error reporting and display settings are now primarily controlled by core.php
// ini_set('display_errors', '0');
// error_reporting(E_ALL);

// --- Includes ---
// core.php MUST include helpers.php for this script to work as intended.
require_once __DIR__ . '/../config/core.php';   // Defines constants, includes helpers.php
require_once __DIR__ . '/../config/db.php';       // Provides $pdo database connection
require_once __DIR__ . '/../vendor/autoload.php'; // Composer autoloader (for firebase/php-jwt)

// Use statements for JWT library classes
use Firebase\JWT\JWT;
use Firebase\JWT\Key;

// --- CORS Handling ---
// handleCors() is now available globally from helpers.php (included via core.php)
handleCors();

// --- Request Method Check ---
if (strtoupper($_SERVER['REQUEST_METHOD']) !== 'POST') {
    // sendJsonResponse is from helpers.php
    sendJsonResponse(['status' => 'error', 'message' => 'Invalid request method. Only POST is accepted.'], 405);
}

// --- Get Input Data ---
$input = json_decode(file_get_contents('php://input'), true);

if (json_last_error() !== JSON_ERROR_NONE || !isset($input['action'])) {
    sendJsonResponse(['status' => 'error', 'message' => 'Invalid JSON input or missing action.'], 400);
}

$action = trim($input['action']);

// --- JWT Key from core.php (constant) ---
// This check ensures core.php is properly defining critical constants.
if (!defined('JWT_SECRET_KEY') || !defined('JWT_ISSUER') || !defined('JWT_AUDIENCE') || !defined('JWT_EXPIRATION_TIME_SECONDS') || !defined('JWT_ALGORITHM')) {
    error_log("One or more JWT constants (JWT_SECRET_KEY, JWT_ISSUER, JWT_AUDIENCE, JWT_EXPIRATION_TIME_SECONDS, JWT_ALGORITHM) are not defined in core.php");
    sendJsonResponse(['status' => 'error', 'message' => 'Server configuration error regarding JWT settings.'], 500);
}
$jwtKey = JWT_SECRET_KEY;
$jwtIssuer = JWT_ISSUER;
$jwtAudience = JWT_AUDIENCE;
$jwtExpirationSeconds = JWT_EXPIRATION_TIME_SECONDS;
$jwtAlgorithm = JWT_ALGORITHM;


// --- Action: Signup ---
if ($action === 'signup') {
    // Validate input
    $name = trim($input['name'] ?? '');
    $email = filter_var(trim($input['email'] ?? ''), FILTER_SANITIZE_EMAIL);
    $password = $input['password'] ?? ''; // Password will be hashed, so minimal trimming
    $role = trim($input['role'] ?? 'CLIENT'); // Default to CLIENT if not provided (as per constants.ts)

    if (empty($name)) {
        sendJsonResponse(['status' => 'error', 'message' => 'Name is required for signup.'], 400);
    }
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        sendJsonResponse(['status' => 'error', 'message' => 'A valid email address is required for signup.'], 400);
    }
    if (empty($password)) {
        sendJsonResponse(['status' => 'error', 'message' => 'Password is required for signup.'], 400);
    }
    if (strlen($password) < 6) { // Example: Basic password length validation
        sendJsonResponse(['status' => 'error', 'message' => 'Password must be at least 6 characters long.'], 400);
    }

    // Define allowed roles for self-signup (ADMIN role is usually created manually or via a separate process)
    $allowedSignupRoles = ['CLIENT', 'THERAPIST', 'CLINIC_OWNER'];
    if (!in_array($role, $allowedSignupRoles)) {
        sendJsonResponse(['status' => 'error', 'message' => 'Invalid role selected for signup.'], 400);
    }

    try {
        $pdo->beginTransaction();

        // Check if email already exists
        $stmt = $pdo->prepare("SELECT id FROM users WHERE email = :email");
        $stmt->bindParam(':email', $email);
        $stmt->execute();
        if ($stmt->fetch()) {
            $pdo->rollBack();
            sendJsonResponse(['status' => 'error', 'message' => 'Email address is already registered.'], 409); // 409 Conflict
        }

        // Hash the password
        $password_hash = password_hash($password, PASSWORD_BCRYPT);
        if ($password_hash === false) {
             $pdo->rollBack();
             error_log("Password hashing failed for email: " . $email);
             sendJsonResponse(['status' => 'error', 'message' => 'Error processing registration. Please try again.'], 500);
        }

        // Generate unique user ID using helper from helpers.php
        $userId = generateUniqueId('user_');

        // Generate a default profile picture URL (using a service like Picsum for placeholder)
        $defaultProfilePictureUrl = "https://picsum.photos/seed/{$userId}/200/200"; // Example

        // Insert new user into 'users' table
        $stmtUserInsert = $pdo->prepare("INSERT INTO users (id, name, email, password_hash, role, profile_picture_url) VALUES (:id, :name, :email, :password_hash, :role, :profile_picture_url)");
        $stmtUserInsert->bindParam(':id', $userId);
        $stmtUserInsert->bindParam(':name', $name);
        $stmtUserInsert->bindParam(':email', $email);
        $stmtUserInsert->bindParam(':password_hash', $password_hash);
        $stmtUserInsert->bindParam(':role', $role);
        $stmtUserInsert->bindParam(':profile_picture_url', $defaultProfilePictureUrl);
        
        if (!$stmtUserInsert->execute()) {
            $pdo->rollBack();
            error_log("Failed to insert user into database for email: " . $email);
            sendJsonResponse(['status' => 'error', 'message' => 'Registration failed (user creation). Please try again.'], 500);
        }

        // User successfully created, now create associated data if therapist or clinic owner
        if ($role === 'THERAPIST') {
            $stmt_therapist = $pdo->prepare("INSERT INTO therapists_data (user_id, account_status) VALUES (:user_id, 'draft')");
            $stmt_therapist->bindParam(':user_id', $userId);
            if (!$stmt_therapist->execute()) {
                $pdo->rollBack();
                error_log("Failed to insert therapist_data for user ID: " . $userId);
                sendJsonResponse(['status' => 'error', 'message' => 'Registration failed (therapist data). Please try again.'], 500);
            }
        } elseif ($role === 'CLINIC_OWNER') {
            $clinic_id_unique = generateUniqueId('clinic_'); // From helpers.php
            $stmt_clinic = $pdo->prepare("INSERT INTO clinics_data (user_id, clinic_id, clinic_name, account_status) VALUES (:user_id, :clinic_id, :clinic_name, 'draft')");
            $clinic_name_default = $name . "'s Clinic"; // Example default clinic name
            $stmt_clinic->bindParam(':user_id', $userId);
            $stmt_clinic->bindParam(':clinic_id', $clinic_id_unique);
            $stmt_clinic->bindParam(':clinic_name', $clinic_name_default);
            if (!$stmt_clinic->execute()) {
                $pdo->rollBack();
                error_log("Failed to insert clinics_data for user ID: " . $userId);
                sendJsonResponse(['status' => 'error', 'message' => 'Registration failed (clinic data). Please try again.'], 500);
            }
        }

        // All database operations successful, commit transaction
        $pdo->commit();

        // Generate JWT Token
        $issuedAt = time();
        $expirationTime = $issuedAt + $jwtExpirationSeconds;

        $tokenPayload = [
            'iss' => $jwtIssuer,         // Issuer of the token
            'aud' => $jwtAudience,       // Audience of the token
            'iat' => $issuedAt,          // Issued at: time when the token was generated
            'exp' => $expirationTime,    // Expiration time
            'data' => [                  // User-specific claims
                'userId' => $userId,
                'email' => $email,
                'role' => $role,
                'name' => $name // Include name in token data for convenience
            ]
        ];

        $jwt = JWT::encode($tokenPayload, $jwtKey, $jwtAlgorithm);

        sendJsonResponse([
            'status' => 'success',
            'message' => 'Signup successful.',
            'token' => $jwt,
            'user' => [ // Return user data consistent with User type in frontend (types.ts)
                'id' => $userId,
                'name' => $name,
                'email' => $email,
                'role' => $role,
                'profilePictureUrl' => $defaultProfilePictureUrl
            ]
        ], 201); // 201 Created

    } catch (PDOException $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        error_log("Database error during signup: " . $e->getMessage() . " for email " . $email);
        sendJsonResponse(['status' => 'error', 'message' => 'A server error occurred during registration. Please try again later.'], 500);
    } catch (Exception $e) { // Catch any other general exceptions
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        error_log("General error during signup: " . $e->getMessage() . " for email " . $email);
        sendJsonResponse(['status' => 'error', 'message' => 'An unexpected error occurred. Please try again.'], 500);
    }
}

// --- Action: Login ---
elseif ($action === 'login') {
    $email = filter_var(trim($input['email'] ?? ''), FILTER_SANITIZE_EMAIL);
    $password = $input['password'] ?? '';

    if (!filter_var($email, FILTER_VALIDATE_EMAIL) || empty($password)) {
        sendJsonResponse(['status' => 'error', 'message' => 'Valid email and password are required for login.'], 400);
    }

    try {
        $stmt = $pdo->prepare("SELECT id, name, email, password_hash, role, profile_picture_url FROM users WHERE email = :email");
        $stmt->bindParam(':email', $email);
        $stmt->execute();
        $user = $stmt->fetch(PDO::FETCH_ASSOC);

        if ($user && password_verify($password, $user['password_hash'])) {
            // Password is correct, generate JWT
            $issuedAt = time();
            $expirationTime = $issuedAt + $jwtExpirationSeconds;

            $tokenPayload = [
                'iss' => $jwtIssuer,
                'aud' => $jwtAudience,
                'iat' => $issuedAt,
                'exp' => $expirationTime,
                'data' => [
                    'userId' => $user['id'],
                    'email' => $user['email'],
                    'role' => $user['role'],
                    'name' => $user['name']
                ]
            ];

            $jwt = JWT::encode($tokenPayload, $jwtKey, $jwtAlgorithm);

            sendJsonResponse([
                'status' => 'success',
                'message' => 'Login successful.',
                'token' => $jwt,
                'user' => [ // Send back necessary user info consistent with User type
                    'id' => $user['id'],
                    'name' => $user['name'],
                    'email' => $user['email'],
                    'role' => $user['role'],
                    'profilePictureUrl' => $user['profile_picture_url'] ?? null
                ]
            ], 200);
        } else {
            sendJsonResponse(['status' => 'error', 'message' => 'Invalid email or password.'], 401); // 401 Unauthorized
        }

    } catch (PDOException $e) {
        error_log("Database error during login for email {$email}: " . $e->getMessage());
        sendJsonResponse(['status' => 'error', 'message' => 'A server error occurred during login. Please try again later.'], 500);
    } catch (Exception $e) {
        error_log("General error during login for email {$email}: " . $e->getMessage());
        sendJsonResponse(['status' => 'error', 'message' => 'An unexpected error occurred during login.'], 500);
    }
}

// --- Unknown Action ---
else {
    sendJsonResponse(['status' => 'error', 'message' => "Unknown action requested: '{$action}'."], 400);
}

?>