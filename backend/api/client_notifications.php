<?php
// backend/api/client_notifications.php

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
        error_log("JWT_SECRET_KEY is not defined in core.php for client_notifications.php");
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
            error_log("JWT Decode Error for client_notifications: " . $e->getMessage());
            sendJsonResponse(['status' => 'error', 'message' => 'Invalid token: ' . $e->getMessage()], 401);
        }
        exit;
    }

    // --- Check if notifications table exists, create if not ---
    function ensureNotificationsTableExists(PDO $pdo): void {
        $checkTableStmt = $pdo->prepare("
            SELECT COUNT(*) 
            FROM information_schema.tables 
            WHERE table_schema = DATABASE() 
            AND table_name = 'user_notifications'
        ");
        $checkTableStmt->execute();
        $tableExists = (bool)$checkTableStmt->fetchColumn();

        if (!$tableExists) {
            // Create the table if it doesn't exist
            $createTableSql = "
                CREATE TABLE user_notifications (
                    id VARCHAR(255) NOT NULL,
                    user_id VARCHAR(255) NOT NULL,
                    type VARCHAR(50) NOT NULL,
                    title VARCHAR(255) NOT NULL,
                    message TEXT NOT NULL,
                    is_read BOOLEAN DEFAULT FALSE,
                    related_entity_type VARCHAR(50),
                    related_entity_id VARCHAR(255),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (id),
                    KEY user_idx (user_id),
                    CONSTRAINT fk_notifications_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
            ";
            $pdo->exec($createTableSql);
        }
    }

    // --- Handle GET Request: Fetch client's notifications ---
    if ($method === 'GET') {
        $authData = getAuthenticatedClient($jwtKey);
        $clientUserId = $authData['userId'];

        try {
            ensureNotificationsTableExists($pdo);

            // Get query parameters
            $unreadOnly = isset($_GET['unreadOnly']) && $_GET['unreadOnly'] === 'true';
            $limit = isset($_GET['limit']) ? min(100, max(1, (int)$_GET['limit'])) : 20;
            $offset = isset($_GET['offset']) ? max(0, (int)$_GET['offset']) : 0;

            // Build query
            $sql = "
                SELECT *
                FROM user_notifications
                WHERE user_id = :user_id
            ";
            $params = [':user_id' => $clientUserId];

            // Add filters
            if ($unreadOnly) {
                $sql .= " AND is_read = FALSE";
            }

            // Order by date and add limit/offset
            $sql .= " ORDER BY created_at DESC LIMIT :limit OFFSET :offset";

            $stmt = $pdo->prepare($sql);
            $stmt->bindParam(':user_id', $clientUserId);
            $stmt->bindParam(':limit', $limit, PDO::PARAM_INT);
            $stmt->bindParam(':offset', $offset, PDO::PARAM_INT);
            $stmt->execute();
            $notifications = $stmt->fetchAll(PDO::FETCH_ASSOC);

            // Get total count for pagination
            $countSql = "
                SELECT COUNT(*)
                FROM user_notifications
                WHERE user_id = :user_id
            ";
            $countParams = [':user_id' => $clientUserId];
            if ($unreadOnly) {
                $countSql .= " AND is_read = FALSE";
            }
            $countStmt = $pdo->prepare($countSql);
            $countStmt->execute($countParams);
            $totalCount = (int)$countStmt->fetchColumn();

            // Get unread count
            $unreadCountStmt = $pdo->prepare("
                SELECT COUNT(*)
                FROM user_notifications
                WHERE user_id = :user_id AND is_read = FALSE
            ");
            $unreadCountStmt->bindParam(':user_id', $clientUserId);
            $unreadCountStmt->execute();
            $unreadCount = (int)$unreadCountStmt->fetchColumn();

            sendJsonResponse([
                'status' => 'success',
                'notifications' => $notifications,
                'pagination' => [
                    'total' => $totalCount,
                    'unreadCount' => $unreadCount,
                    'limit' => $limit,
                    'offset' => $offset
                ]
            ], 200);
        } catch (PDOException $e) {
            error_log("Database error fetching client notifications: " . $e->getMessage());
            sendJsonResponse(['status' => 'error', 'message' => 'Failed to fetch notifications.'], 500);
        }
    }

    // --- Handle PUT Request: Mark notifications as read ---
    elseif ($method === 'PUT') {
        $authData = getAuthenticatedClient($jwtKey);
        $clientUserId = $authData['userId'];

        $input = json_decode(file_get_contents('php://input'), true);

        if (json_last_error() !== JSON_ERROR_NONE) {
            sendJsonResponse(['status' => 'error', 'message' => 'Invalid JSON input.'], 400);
        }

        $notificationIds = $input['notificationIds'] ?? [];
        $markAllRead = isset($input['markAllRead']) && $input['markAllRead'] === true;

        if (empty($notificationIds) && !$markAllRead) {
            sendJsonResponse(['status' => 'error', 'message' => 'Either notificationIds array or markAllRead flag must be provided.'], 400);
        }

        try {
            ensureNotificationsTableExists($pdo);

            $pdo->beginTransaction();

            if ($markAllRead) {
                // Mark all notifications as read
                $updateAllStmt = $pdo->prepare("
                    UPDATE user_notifications
                    SET is_read = TRUE
                    WHERE user_id = :user_id AND is_read = FALSE
                ");
                $updateAllStmt->bindParam(':user_id', $clientUserId);
                $updateAllStmt->execute();
                $updatedCount = $updateAllStmt->rowCount();
            } else {
                // Mark specific notifications as read
                $placeholders = implode(',', array_fill(0, count($notificationIds), '?'));
                $updateSpecificSql = "
                    UPDATE user_notifications
                    SET is_read = TRUE
                    WHERE user_id = ? AND id IN ({$placeholders}) AND is_read = FALSE
                ";
                $updateSpecificStmt = $pdo->prepare($updateSpecificSql);
                $params = array_merge([$clientUserId], $notificationIds);
                $updateSpecificStmt->execute($params);
                $updatedCount = $updateSpecificStmt->rowCount();
            }

            $pdo->commit();

            sendJsonResponse([
                'status' => 'success',
                'message' => 'Notifications marked as read.',
                'updatedCount' => $updatedCount
            ], 200);
        } catch (PDOException $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            error_log("Database error marking notifications as read: " . $e->getMessage());
            sendJsonResponse(['status' => 'error', 'message' => 'Failed to mark notifications as read.'], 500);
        }
    }

    // --- Invalid Method ---
    else {
        sendJsonResponse(['status' => 'error', 'message' => 'Invalid request method for client notifications.'], 405);
    }
} catch (Throwable $e) {
    // Log the error and send a clean JSON response
    error_log("Unhandled error in client_notifications.php: " . $e->getMessage());
    error_log("Stack trace: " . $e->getTraceAsString());
    sendJsonResponse(['status' => 'error', 'message' => 'An unexpected error occurred.'], 500);
}
?>