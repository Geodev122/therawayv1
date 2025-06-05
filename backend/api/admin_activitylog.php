<?php
// backend/api/admin_activitylog.php

declare(strict_types=1);
ini_set('display_errors', '0'); // Log errors, don't display in API output
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

if (!$jwtKey) {
    error_log("JWT_SECRET_KEY is not defined in core.php for admin_activitylog.php");
    sendJsonResponse(['status' => 'error', 'message' => 'Server configuration error (JWT).'], 500);
}

/**
 * Authenticates an admin user from JWT.
 * Sends error response and exits if authentication fails.
 * @param string $jwtKey The JWT secret key.
 * @return array Decoded JWT payload containing admin user data.
 */
function authenticateAdmin(string $jwtKey): array {
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
        if (!isset($decoded->data) || !isset($decoded->data->role) || $decoded->data->role !== 'ADMIN' || !isset($decoded->data->userId)) {
            sendJsonResponse(['status' => 'error', 'message' => 'Access denied. Admin role required.'], 403);
        }
        // Add admin's name to the returned data if available in token
        $adminName = isset($decoded->data->name) ? $decoded->data->name : 'Admin User';
        return ['userId' => $decoded->data->userId, 'role' => $decoded->data->role, 'name' => $adminName];
    } catch (ExpiredException $e) {
        sendJsonResponse(['status' => 'error', 'message' => 'Token has expired.'], 401);
    } catch (SignatureInvalidException $e) {
        sendJsonResponse(['status' => 'error', 'message' => 'Token signature invalid.'], 401);
    } catch (BeforeValidException $e) {
        sendJsonResponse(['status' => 'error', 'message' => 'Token not yet valid.'], 401);
    } catch (Exception $e) {
        error_log("JWT Decode Error for admin_activitylog: " . $e->getMessage());
        sendJsonResponse(['status' => 'error', 'message' => 'Invalid token: ' . $e->getMessage()], 401);
    }
    exit;
}


// --- Handle GET Request: Fetch activity logs ---
if ($method === 'GET') {
    $adminData = authenticateAdmin($jwtKey); // All actions here require admin

    // Pagination and filtering parameters
    $page = isset($_GET['page']) ? max(1, (int)$_GET['page']) : 1;
    $limit = isset($_GET['limit']) ? max(1, min(100, (int)$_GET['limit'])) : 25; // Default 25 per page
    $offset = ($page - 1) * $limit;
    
    $filterAction = isset($_GET['action']) ? trim($_GET['action']) : null;
    $filterUser = isset($_GET['user']) ? trim($_GET['user']) : null; // Can be user_id or user_name

    $whereClauses = [];
    $params = [];

    if ($filterAction) {
        $whereClauses[] = "action LIKE :action";
        $params[':action'] = "%{$filterAction}%";
    }
    if ($filterUser) {
        $whereClauses[] = "(user_id LIKE :user OR user_name LIKE :user)";
        $params[':user'] = "%{$filterUser}%";
    }

    $sqlWhere = count($whereClauses) > 0 ? " WHERE " . implode(" AND ", $whereClauses) : "";
    $sqlOrder = " ORDER BY timestamp DESC"; // Newest logs first

    try {
        // Count total items for pagination
        $countSql = "SELECT COUNT(*) FROM activity_logs" . $sqlWhere;
        $countStmt = $pdo->prepare($countSql);
        $countStmt->execute($params);
        $totalItems = (int)$countStmt->fetchColumn();
        $totalPages = ceil($totalItems / $limit);

        // Fetch logs for the current page
        $mainSql = "SELECT * FROM activity_logs" . $sqlWhere . $sqlOrder . " LIMIT :limit OFFSET :offset";
        
        $stmt = $pdo->prepare($mainSql);
        foreach ($params as $key => $value) {
            $stmt->bindValue($key, $value);
        }
        $stmt->bindParam(':limit', $limit, PDO::PARAM_INT);
        $stmt->bindParam(':offset', $offset, PDO::PARAM_INT);
        $stmt->execute();
        $logs = $stmt->fetchAll(PDO::FETCH_ASSOC);

        // Decode 'details' if it's JSON string
        foreach ($logs as &$log) {
            if (isset($log['details'])) {
                $decodedDetails = json_decode($log['details'], true);
                if (json_last_error() === JSON_ERROR_NONE) {
                    $log['details'] = $decodedDetails;
                }
                // If not valid JSON, it remains a string (as it was stored)
            }
        }
        unset($log); // Unset reference

        sendJsonResponse([
            'status' => 'success',
            'data' => $logs, // Key 'data' to match AdminDashboardPage.tsx
            'pagination' => [
                'currentPage' => $page,
                'totalPages' => $totalPages,
                'totalItems' => $totalItems,
                'itemsPerPage' => $limit
            ]
        ], 200);

    } catch (PDOException $e) {
        error_log("Database error fetching activity logs: " . $e->getMessage());
        sendJsonResponse(['status' => 'error', 'message' => 'Failed to fetch activity logs.'], 500);
    }
}

// --- Handle POST Request: Add a new activity log entry (manual admin action) ---
elseif ($method === 'POST') {
    $adminData = authenticateAdmin($jwtKey);
    $adminUserId = $adminData['userId'];
    $adminUserName = $adminData['name'];

    $input = json_decode(file_get_contents('php://input'), true);

    if (json_last_error() !== JSON_ERROR_NONE) {
        sendJsonResponse(['status' => 'error', 'message' => 'Invalid JSON input.'], 400);
    }

    $action = trim($input['action'] ?? '');
    $targetId = isset($input['targetId']) ? trim($input['targetId']) : null;
    $targetType = isset($input['targetType']) ? trim($input['targetType']) : null;
    $detailsInput = $input['details'] ?? null; // Can be string or object/array

    // Basic validation
    if (empty($action)) {
        sendJsonResponse(['status' => 'error', 'message' => 'Action description is required.'], 400);
    }

    // Convert details to JSON string if it's an array or object
    $detailsJson = null;
    if (is_array($detailsInput) || is_object($detailsInput)) {
        $detailsJson = json_encode($detailsInput);
    } elseif (is_string($detailsInput)) {
        $detailsJson = $detailsInput; // Assume it's either a pre-formatted JSON string or just a text detail
    }


    try {
        $logId = 'alog_' . generateUniqueId(); // From core.php
        $timestamp = date('Y-m-d H:i:s'); // Current timestamp

        $stmt = $pdo->prepare("
            INSERT INTO activity_logs (id, timestamp, user_id, user_name, user_role, action, target_id, target_type, details) 
            VALUES (:id, :timestamp, :user_id, :user_name, :user_role, :action, :target_id, :target_type, :details)
        ");
        
        $adminRole = 'ADMIN'; // The user performing this manual log is an admin
        $stmt->bindParam(':id', $logId);
        $stmt->bindParam(':timestamp', $timestamp);
        $stmt->bindParam(':user_id', $adminUserId);
        $stmt->bindParam(':user_name', $adminUserName);
        $stmt->bindParam(':user_role', $adminRole, PDO::PARAM_STR);
        $stmt->bindParam(':action', $action);
        $stmt->bindParam(':target_id', $targetId, PDO::PARAM_STR);
        $stmt->bindParam(':target_type', $targetType, PDO::PARAM_STR);
        $stmt->bindParam(':details', $detailsJson, PDO::PARAM_STR);

        if ($stmt->execute()) {
            // Fetch the newly created log to return it
            $newLogStmt = $pdo->prepare("SELECT * FROM activity_logs WHERE id = :id");
            $newLogStmt->bindParam(':id', $logId);
            $newLogStmt->execute();
            $newLog = $newLogStmt->fetch(PDO::FETCH_ASSOC);
            if ($newLog && isset($newLog['details'])) {
                 $decodedDetails = json_decode($newLog['details'], true);
                 if (json_last_error() === JSON_ERROR_NONE) $newLog['details'] = $decodedDetails;
            }

            sendJsonResponse(['status' => 'success', 'message' => 'Activity log entry added.', 'log' => $newLog], 201);
        } else {
            error_log("Failed to insert activity log: " . $action);
            sendJsonResponse(['status' => 'error', 'message' => 'Failed to add activity log entry.'], 500);
        }
    } catch (PDOException $e) {
        error_log("Database error adding activity log: " . $e->getMessage());
        sendJsonResponse(['status' => 'error', 'message' => 'A server error occurred while adding log entry.'], 500);
    }
}

// --- Invalid Method ---
else {
    sendJsonResponse(['status' => 'error', 'message' => 'Invalid request method for admin/activitylog.'], 405);
}
?>