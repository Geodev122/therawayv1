<?php
// backend/api/client_profile.php

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
        error_log("JWT_SECRET_KEY is not defined in core.php for client_profile.php");
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
            error_log("JWT Decode Error for client_profile: " . $e->getMessage());
            sendJsonResponse(['status' => 'error', 'message' => 'Invalid token: ' . $e->getMessage()], 401);
        }
        exit;
    }

    /**
     * Fetches the client profile.
     * @param string $userId The client's user ID.
     * @param PDO $pdo The PDO database connection object.
     * @return array|null The client profile or null if not found.
     */
    function fetchClientProfile(string $userId, PDO $pdo): ?array {
        $stmt = $pdo->prepare("
            SELECT 
                id, name, email, profile_picture_url, role, created_at, updated_at
            FROM users
            WHERE id = :userId AND role = 'CLIENT'
        ");
        $stmt->bindParam(':userId', $userId);
        $stmt->execute();
        $client = $stmt->fetch(PDO::FETCH_ASSOC);

        if ($client) {
            // Format the client data for frontend
            return [
                'id' => $client['id'],
                'name' => $client['name'],
                'email' => $client['email'],
                'profilePictureUrl' => $client['profile_picture_url'],
                'role' => $client['role'],
                'createdAt' => $client['created_at'],
                'updatedAt' => $client['updated_at']
            ];
        }
        return null;
    }

    // --- Handle GET Request: Fetch client profile ---
    if ($method === 'GET') {
        $authData = getAuthenticatedClient($jwtKey);
        $clientUserId = $authData['userId'];

        try {
            $clientProfile = fetchClientProfile($clientUserId, $pdo);

            if ($clientProfile) {
                sendJsonResponse(['status' => 'success', 'client' => $clientProfile], 200);
            } else {
                sendJsonResponse(['status' => 'not_found', 'message' => 'Client profile not found.'], 404);
            }
        } catch (PDOException $e) {
            error_log("Database error fetching client profile: " . $e->getMessage());
            sendJsonResponse(['status' => 'error', 'message' => 'A server error occurred while fetching the profile.'], 500);
        }
    }

    // --- Handle PUT Request: Update client profile ---
    elseif ($method === 'PUT') {
        $authData = getAuthenticatedClient($jwtKey);
        $clientUserId = $authData['userId'];

        $input = json_decode(file_get_contents('php://input'), true);

        if (json_last_error() !== JSON_ERROR_NONE) {
            sendJsonResponse(['status' => 'error', 'message' => 'Invalid JSON input.'], 400);
        }

        // Fields that can be updated
        $name = isset($input['name']) ? trim($input['name']) : null;
        $profilePictureUrl = isset($input['profilePictureUrl']) ? filter_var(trim($input['profilePictureUrl']), FILTER_SANITIZE_URL) : null;

        // Basic validation
        if (isset($input['name']) && empty($input['name'])) {
            sendJsonResponse(['status' => 'error', 'message' => 'Name cannot be empty.'], 400);
        }

        try {
            $updateFields = [];
            $params = [':id' => $clientUserId];

            if ($name !== null) {
                $updateFields[] = "name = :name";
                $params[':name'] = $name;
            }
            if ($profilePictureUrl !== null) {
                $updateFields[] = "profile_picture_url = :profile_picture_url";
                $params[':profile_picture_url'] = $profilePictureUrl;
            }

            if (count($updateFields) === 0) {
                // If no fields to update, fetch current profile and return that
                $currentProfile = fetchClientProfile($clientUserId, $pdo);
                sendJsonResponse(['status' => 'success', 'message' => 'No changes detected.', 'client' => $currentProfile], 200);
                exit;
            }

            $updateFields[] = "updated_at = NOW()";
            $sql = "UPDATE users SET " . implode(", ", $updateFields) . " WHERE id = :id AND role = 'CLIENT'";
            $stmt = $pdo->prepare($sql);

            if ($stmt->execute($params)) {
                $updatedProfile = fetchClientProfile($clientUserId, $pdo);
                sendJsonResponse(['status' => 'success', 'message' => 'Profile updated successfully.', 'client' => $updatedProfile], 200);
            } else {
                error_log("Failed to update client profile for ID: " . $clientUserId);
                sendJsonResponse(['status' => 'error', 'message' => 'Failed to update profile.'], 500);
            }
        } catch (PDOException $e) {
            error_log("Database error updating client profile: " . $e->getMessage());
            sendJsonResponse(['status' => 'error', 'message' => 'A server error occurred while updating the profile.'], 500);
        }
    }

    // --- Invalid Method ---
    else {
        sendJsonResponse(['status' => 'error', 'message' => 'Invalid request method for client profile.'], 405);
    }
} catch (Throwable $e) {
    // Log the error and send a clean JSON response
    error_log("Unhandled error in client_profile.php: " . $e->getMessage());
    error_log("Stack trace: " . $e->getTraceAsString());
    sendJsonResponse(['status' => 'error', 'message' => 'An unexpected error occurred.'], 500);
}
?>