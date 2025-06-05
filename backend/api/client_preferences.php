<?php
// backend/api/client_preferences.php

declare(strict_types=1);
ini_set('display_errors', '0'); // Log errors, don't display in API output
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

    // --- Request Method & JWT Key ---
    $method = strtoupper($_SERVER['REQUEST_METHOD']);
    $jwtKey = defined('JWT_SECRET_KEY') ? JWT_SECRET_KEY : null;

    if (!$jwtKey) {
        error_log("JWT_SECRET_KEY is not defined in core.php for client_preferences.php");
        sendJsonResponse(['status' => 'error', 'message' => 'Server configuration error (JWT).'], 500);
    }

    /**
     * Helper function to get authenticated user ID and role from JWT.
     * @param string $jwtKey The JWT secret key.
     * @return array ['userId' => string, 'role' => string] or exits.
     */
    function getAuthenticatedClient(string $jwtKey): array {
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
            if ($decoded->data->role !== 'CLIENT' && $decoded->data->role !== 'ADMIN') {
                sendJsonResponse(['status' => 'error', 'message' => 'Access denied. Client role required.'], 403);
            }
            return ['userId' => $decoded->data->userId, 'role' => $decoded->data->role];
        } catch (ExpiredException $e) {
            sendJsonResponse(['status' => 'error', 'message' => 'Token has expired.'], 401);
        } catch (SignatureInvalidException $e) {
            sendJsonResponse(['status' => 'error', 'message' => 'Token signature invalid.'], 401);
        } catch (BeforeValidException $e) {
            sendJsonResponse(['status' => 'error', 'message' => 'Token not yet valid.'], 401);
        } catch (Exception $e) {
            error_log("JWT Decode Error for client_preferences: " . $e->getMessage());
            sendJsonResponse(['status' => 'error', 'message' => 'Invalid token: ' . $e->getMessage()], 401);
        }
        exit;
    }

    // --- Handle GET Request: Fetch client preferences ---
    if ($method === 'GET') {
        $authData = getAuthenticatedClient($jwtKey);
        $clientUserId = $authData['userId'];

        try {
            // Check if client_preferences table exists, if not, create it
            $checkTableStmt = $pdo->prepare("
                SELECT COUNT(*) 
                FROM information_schema.tables 
                WHERE table_schema = DATABASE() 
                AND table_name = 'client_preferences'
            ");
            $checkTableStmt->execute();
            $tableExists = (bool)$checkTableStmt->fetchColumn();

            if (!$tableExists) {
                // Create the table if it doesn't exist
                $createTableSql = "
                    CREATE TABLE client_preferences (
                        client_user_id VARCHAR(255) NOT NULL,
                        preferences_json JSON DEFAULT NULL,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                        PRIMARY KEY (client_user_id),
                        CONSTRAINT fk_client_preferences_users FOREIGN KEY (client_user_id) REFERENCES users (id) ON DELETE CASCADE
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
                ";
                $pdo->exec($createTableSql);
            }

            // Fetch client preferences
            $stmt = $pdo->prepare("
                SELECT preferences_json 
                FROM client_preferences 
                WHERE client_user_id = :client_id
            ");
            $stmt->bindParam(':client_id', $clientUserId);
            $stmt->execute();
            $result = $stmt->fetch(PDO::FETCH_ASSOC);

            if ($result && $result['preferences_json']) {
                $preferences = json_decode($result['preferences_json'], true);
                sendJsonResponse(['status' => 'success', 'preferences' => $preferences], 200);
            } else {
                // Return default preferences if none found
                $defaultPreferences = [
                    'theme' => 'light',
                    'notifications' => true,
                    'language' => 'en',
                    'therapistFilters' => [
                        'specializations' => [],
                        'languages' => [],
                        'minRating' => 0,
                        'availability' => []
                    ]
                ];
                sendJsonResponse(['status' => 'success', 'preferences' => $defaultPreferences], 200);
            }
        } catch (PDOException $e) {
            error_log("Database error fetching client preferences: " . $e->getMessage());
            sendJsonResponse(['status' => 'error', 'message' => 'A server error occurred while fetching preferences.'], 500);
        }
    }

    // --- Handle PUT Request: Update client preferences ---
    elseif ($method === 'PUT') {
        $authData = getAuthenticatedClient($jwtKey);
        $clientUserId = $authData['userId'];

        $input = json_decode(file_get_contents('php://input'), true);

        if (json_last_error() !== JSON_ERROR_NONE) {
            sendJsonResponse(['status' => 'error', 'message' => 'Invalid JSON input.'], 400);
        }

        if (!isset($input['preferences']) || !is_array($input['preferences'])) {
            sendJsonResponse(['status' => 'error', 'message' => 'Preferences data is required and must be an object.'], 400);
        }

        $preferences = $input['preferences'];
        $preferencesJson = json_encode($preferences);

        try {
            // Check if client_preferences table exists, if not, create it
            $checkTableStmt = $pdo->prepare("
                SELECT COUNT(*) 
                FROM information_schema.tables 
                WHERE table_schema = DATABASE() 
                AND table_name = 'client_preferences'
            ");
            $checkTableStmt->execute();
            $tableExists = (bool)$checkTableStmt->fetchColumn();

            if (!$tableExists) {
                // Create the table if it doesn't exist
                $createTableSql = "
                    CREATE TABLE client_preferences (
                        client_user_id VARCHAR(255) NOT NULL,
                        preferences_json JSON DEFAULT NULL,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                        PRIMARY KEY (client_user_id),
                        CONSTRAINT fk_client_preferences_users FOREIGN KEY (client_user_id) REFERENCES users (id) ON DELETE CASCADE
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
                ";
                $pdo->exec($createTableSql);
            }

            // Check if preferences already exist for this client
            $checkStmt = $pdo->prepare("
                SELECT COUNT(*) 
                FROM client_preferences 
                WHERE client_user_id = :client_id
            ");
            $checkStmt->bindParam(':client_id', $clientUserId);
            $checkStmt->execute();
            $preferencesExist = (bool)$checkStmt->fetchColumn();

            if ($preferencesExist) {
                // Update existing preferences
                $stmt = $pdo->prepare("
                    UPDATE client_preferences 
                    SET preferences_json = :preferences_json, updated_at = NOW() 
                    WHERE client_user_id = :client_id
                ");
            } else {
                // Insert new preferences
                $stmt = $pdo->prepare("
                    INSERT INTO client_preferences (client_user_id, preferences_json) 
                    VALUES (:client_id, :preferences_json)
                ");
            }

            $stmt->bindParam(':client_id', $clientUserId);
            $stmt->bindParam(':preferences_json', $preferencesJson);
            
            if ($stmt->execute()) {
                sendJsonResponse([
                    'status' => 'success',
                    'message' => 'Preferences updated successfully.',
                    'preferences' => $preferences
                ], 200);
            } else {
                error_log("Failed to update preferences for client ID: " . $clientUserId);
                sendJsonResponse(['status' => 'error', 'message' => 'Failed to update preferences.'], 500);
            }
        } catch (PDOException $e) {
            error_log("Database error updating client preferences: " . $e->getMessage());
            sendJsonResponse(['status' => 'error', 'message' => 'A server error occurred while updating preferences.'], 500);
        }
    }

    // --- Invalid Method ---
    else {
        sendJsonResponse(['status' => 'error', 'message' => 'Invalid request method for client preferences.'], 405);
    }
} catch (Throwable $e) {
    // Log the error and send a clean JSON response
    error_log("Unhandled error in client_preferences.php: " . $e->getMessage());
    error_log("Stack trace: " . $e->getTraceAsString());
    sendJsonResponse(['status' => 'error', 'message' => 'An unexpected error occurred.'], 500);
}
?>