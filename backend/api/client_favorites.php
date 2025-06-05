<?php
// backend/api/user_inquiries.php

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

if (!$jwtKey) {
    error_log("JWT_SECRET_KEY is not defined in core.php");
    // For POST, we might allow submission without JWT, but GET/PUT will fail later if they need auth.
    // If POST must also fail if JWT_SECRET_KEY is not set (e.g., for logging user_id from token), then send error here.
}

/**
 * Authenticates an admin user from JWT.
 * Sends error response and exits if authentication fails.
 * @return array Decoded JWT payload containing user data.
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
        if (!isset($decoded->data) || !isset($decoded->data->role) || $decoded->data->role !== 'ADMIN') {
            sendJsonResponse(['status' => 'error', 'message' => 'Access denied. Admin role required.'], 403);
        }
        return (array)$decoded->data; // Cast to array
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
}


if ($method === 'POST') {
    // --- Submit a new inquiry ---
    $input = json_decode(file_get_contents('php://input'), true);

    if (json_last_error() !== JSON_ERROR_NONE) {
        sendJsonResponse(['status' => 'error', 'message' => 'Invalid JSON input.'], 400);
    }

    $userName = trim($input['userName'] ?? '');
    $userEmail = filter_var(trim($input['userEmail'] ?? ''), FILTER_SANITIZE_EMAIL);
    $subject = trim($input['subject'] ?? '');
    $message = trim($input['message'] ?? '');
    $category = isset($input['category']) ? trim($input['category']) : null;
    $priority = isset($input['priority']) ? trim($input['priority']) : 'medium'; // Default priority

    // Basic validation
    if (empty($userEmail) || !filter_var($userEmail, FILTER_VALIDATE_EMAIL) || empty($subject) || empty($message)) {
        sendJsonResponse(['status' => 'error', 'message' => 'Name (optional), valid email, subject, and message are required.'], 400);
    }
    if ($category && !in_array($category, ['general', 'technical_support', 'billing', 'feedback'])) {
        $category = 'general'; // Default if invalid
    }
    if (!in_array($priority, ['low', 'medium', 'high'])) {
        $priority = 'medium'; // Default if invalid
    }

    $userId = null;
    // Optional: Check if user is logged in and associate inquiry
    if (isset($_SERVER['HTTP_AUTHORIZATION']) && $jwtKey) {
        $authHeader = $_SERVER['HTTP_AUTHORIZATION'];
        list($type, $token) = explode(' ', $authHeader, 2);
        if (strcasecmp($type, 'Bearer') === 0 && !empty($token)) {
            try {
                $decoded = JWT::decode($token, new Key($jwtKey, 'HS256'));
                if (isset($decoded->data) && isset($decoded->data->userId)) {
                    $userId = $decoded->data->userId;
                     // If userName is empty and user is logged in, use their name from token
                    if (empty($userName) && isset($decoded->data->name)) {
                        $userName = $decoded->data->name;
                    }
                }
            } catch (Exception $e) {
                // Token invalid or expired, but inquiry can still be submitted anonymously
                error_log("Optional JWT for inquiry submission was invalid: " . $e->getMessage());
            }
        }
    }

    try {
        $inquiryId = 'inq_' . generateUniqueId(); // From core.php

        $stmt = $pdo->prepare("INSERT INTO user_inquiries (id, user_id, user_name, user_email, subject, message, category, priority, status, date) 
                               VALUES (:id, :user_id, :user_name, :user_email, :subject, :message, :category, :priority, 'open', NOW())");
        $stmt->bindParam(':id', $inquiryId);
        $stmt->bindParam(':user_id', $userId, PDO::PARAM_STR_CHAR); // Allow NULL
        $stmt->bindParam(':user_name', $userName);
        $stmt->bindParam(':user_email', $userEmail);
        $stmt->bindParam(':subject', $subject);
        $stmt->bindParam(':message', $message);
        $stmt->bindParam(':category', $category);
        $stmt->bindParam(':priority', $priority);

        if ($stmt->execute()) {
            sendJsonResponse(['status' => 'success', 'message' => 'Inquiry submitted successfully.', 'inquiryId' => $inquiryId], 201);
        } else {
            error_log("Failed to insert inquiry into database for email: " . $userEmail);
            sendJsonResponse(['status' => 'error', 'message' => 'Failed to submit inquiry. Please try again.'], 500);
        }
    } catch (PDOException $e) {
        error_log("Database error submitting inquiry: " . $e->getMessage());
        sendJsonResponse(['status' => 'error', 'message' => 'A server error occurred while submitting your inquiry.'], 500);
    }

} elseif ($method === 'GET') {
    // --- Fetch inquiries (Admin only) ---
    if (!$jwtKey) sendJsonResponse(['status' => 'error', 'message' => 'Server JWT configuration missing.'], 500);
    $adminData = authenticateAdmin($jwtKey);

    // Pagination and filtering parameters
    $page = isset($_GET['page']) ? max(1, (int)$_GET['page']) : 1;
    $limit = isset($_GET['limit']) ? max(1, min(100, (int)$_GET['limit'])) : 20; // Max 100 per page
    $offset = ($page - 1) * $limit;
    $statusFilter = isset($_GET['status']) ? trim($_GET['status']) : null;
    $searchTerm = isset($_GET['searchTerm']) ? trim($_GET['searchTerm']) : null;

    $whereClauses = [];
    $params = [];

    if ($statusFilter && in_array($statusFilter, ['open', 'closed', 'pending_admin_response', 'escalated'])) {
        $whereClauses[] = "status = :status";
        $params[':status'] = $statusFilter;
    }
    if ($searchTerm) {
        $whereClauses[] = "(subject LIKE :searchTerm OR message LIKE :searchTerm OR user_email LIKE :searchTerm OR user_name LIKE :searchTerm)";
        $params[':searchTerm'] = "%{$searchTerm}%";
    }

    $sqlWhere = count($whereClauses) > 0 ? " WHERE " . implode(" AND ", $whereClauses) : "";
    $sqlOrder = " ORDER BY date DESC"; // Newest first

    try {
        // Count total items for pagination
        $countStmt = $pdo->prepare("SELECT COUNT(*) FROM user_inquiries" . $sqlWhere);
        $countStmt->execute($params);
        $totalItems = (int)$countStmt->fetchColumn();
        $totalPages = ceil($totalItems / $limit);

        // Fetch inquiries for the current page
        $stmt = $pdo->prepare("SELECT * FROM user_inquiries" . $sqlWhere . $sqlOrder . " LIMIT :limit OFFSET :offset");
        // Bind named parameters for main query
        foreach ($params as $key => $value) {
            $stmt->bindValue($key, $value);
        }
        $stmt->bindParam(':limit', $limit, PDO::PARAM_INT);
        $stmt->bindParam(':offset', $offset, PDO::PARAM_INT);
        $stmt->execute();
        $inquiries = $stmt->fetchAll(PDO::FETCH_ASSOC);

        sendJsonResponse([
            'status' => 'success',
            'data' => $inquiries, // Changed from 'inquiries' to 'data' to match AdminDashboardPage
            'pagination' => [
                'currentPage' => $page,
                'totalPages' => $totalPages,
                'totalItems' => $totalItems,
                'itemsPerPage' => $limit
            ]
        ], 200);

    } catch (PDOException $e) {
        error_log("Database error fetching inquiries: " . $e->getMessage());
        sendJsonResponse(['status' => 'error', 'message' => 'Failed to fetch inquiries.'], 500);
    }

} elseif ($method === 'PUT') {
    // --- Update an inquiry (Admin only) ---
    if (!$jwtKey) sendJsonResponse(['status' => 'error', 'message' => 'Server JWT configuration missing.'], 500);
    $adminData = authenticateAdmin($jwtKey);

    $input = json_decode(file_get_contents('php://input'), true);
    if (json_last_error() !== JSON_ERROR_NONE || !isset($input['id'])) {
        sendJsonResponse(['status' => 'error', 'message' => 'Invalid JSON input or missing inquiry ID.'], 400);
    }

    $inquiryId = trim($input['id']);
    $newStatus = isset($input['status']) ? trim($input['status']) : null;
    $adminReply = isset($input['adminReply']) ? trim($input['adminReply']) : null; // Can be empty string to clear reply
    $newPriority = isset($input['priority']) ? trim($input['priority']) : null;

    if (empty($inquiryId)) {
        sendJsonResponse(['status' => 'error', 'message' => 'Inquiry ID is required.'], 400);
    }
    if ($newStatus && !in_array($newStatus, ['open', 'closed', 'pending_admin_response', 'escalated'])) {
        sendJsonResponse(['status' => 'error', 'message' => 'Invalid status provided.'], 400);
    }
    if ($newPriority && !in_array($newPriority, ['low', 'medium', 'high'])) {
        sendJsonResponse(['status' => 'error', 'message' => 'Invalid priority provided.'], 400);
    }

    try {
        // Fetch current inquiry to avoid updating non-existent fields or only if change needed
        $stmt = $pdo->prepare("SELECT * FROM user_inquiries WHERE id = :id");
        $stmt->bindParam(':id', $inquiryId);
        $stmt->execute();
        $currentInquiry = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$currentInquiry) {
            sendJsonResponse(['status' => 'error', 'message' => 'Inquiry not found.'], 404);
        }

        $updateFields = [];
        $params = [':id' => $inquiryId];

        if ($newStatus !== null && $newStatus !== $currentInquiry['status']) {
            $updateFields[] = "status = :status";
            $params[':status'] = $newStatus;
        }
        if ($adminReply !== null && $adminReply !== $currentInquiry['admin_reply']) { // Allow setting reply to empty string
            $updateFields[] = "admin_reply = :admin_reply";
            $params[':admin_reply'] = $adminReply;
        }
        if ($newPriority !== null && $newPriority !== $currentInquiry['priority']) {
            $updateFields[] = "priority = :priority";
            $params[':priority'] = $newPriority;
        }

        if (count($updateFields) === 0) {
            sendJsonResponse(['status' => 'success', 'message' => 'No changes detected.', 'inquiry' => $currentInquiry], 200);
        }

        $sql = "UPDATE user_inquiries SET " . implode(", ", $updateFields) . " WHERE id = :id";
        $stmt = $pdo->prepare($sql);
        
        if ($stmt->execute($params)) {
            // Fetch the updated inquiry to return it
            $stmtUpdated = $pdo->prepare("SELECT * FROM user_inquiries WHERE id = :id");
            $stmtUpdated->bindParam(':id', $inquiryId);
            $stmtUpdated->execute();
            $updatedInquiry = $stmtUpdated->fetch(PDO::FETCH_ASSOC);
            sendJsonResponse(['status' => 'success', 'message' => 'Inquiry updated successfully.', 'inquiry' => $updatedInquiry], 200);
        } else {
            error_log("Failed to update inquiry ID: " . $inquiryId);
            sendJsonResponse(['status' => 'error', 'message' => 'Failed to update inquiry.'], 500);
        }

    } catch (PDOException $e) {
        error_log("Database error updating inquiry: " . $e->getMessage());
        sendJsonResponse(['status' => 'error', 'message' => 'A server error occurred while updating the inquiry.'], 500);
    }

} else {
    sendJsonResponse(['status' => 'error', 'message' => 'Invalid request method.'], 405);
}
?>