<?php
// backend/api/admin_inquiries.php

declare(strict_types=1);
ini_set('display_errors', '0'); // Log errors, don't display in API output
error_reporting(E_ALL);

// --- Includes ---
require_once __DIR__ . '/../config/core.php'; // This now includes helpers.php
require_once __DIR__ . '/../config/db.php';   // Provides $pdo
require_once __DIR__ . '/../vendor/autoload.php'; // Composer autoloader

// JWT classes are used by helpers.php, but good to have here if direct manipulation were needed.
use Firebase\JWT\JWT;
use Firebase\JWT\Key;

// --- CORS Handling ---
handleCors(); // From helpers.php (via core.php)

// --- Request Method & JWT Key ---
$method = strtoupper($_SERVER['REQUEST_METHOD']);
$jwtKey = defined('JWT_SECRET_KEY') ? JWT_SECRET_KEY : null; // Used by getAuthenticatedUser/authenticateAdmin

// --- Handle POST Request: Submit a new inquiry (Public or Authenticated User) ---
if ($method === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);

    if (json_last_error() !== JSON_ERROR_NONE) {
        sendJsonResponse(['status' => 'error', 'message' => 'Invalid JSON input.'], 400);
    }

    $userName = trim($input['userName'] ?? ''); // Optional, user might not provide
    $userEmail = filter_var(trim($input['userEmail'] ?? ''), FILTER_SANITIZE_EMAIL);
    $subject = trim($input['subject'] ?? '');
    $message = trim($input['message'] ?? '');
    $category = isset($input['category']) ? trim($input['category']) : 'general'; // Default category
    $priority = isset($input['priority']) ? trim($input['priority']) : 'medium'; // Default priority

    // Basic validation
    if (empty($userEmail) || !filter_var($userEmail, FILTER_VALIDATE_EMAIL)) {
        sendJsonResponse(['status' => 'error', 'message' => 'A valid email address is required.'], 400);
    }
    if (empty($subject)) {
        sendJsonResponse(['status' => 'error', 'message' => 'Subject is required.'], 400);
    }
    if (empty($message)) {
        sendJsonResponse(['status' => 'error', 'message' => 'Message is required.'], 400);
    }

    $allowedCategories = ['general', 'technical_support', 'billing', 'feedback'];
    if (!in_array($category, $allowedCategories)) {
        $category = 'general';
    }
    $allowedPriorities = ['low', 'medium', 'high'];
    if (!in_array($priority, $allowedPriorities)) {
        $priority = 'medium';
    }

    $loggedInUserId = null;
    $loggedInUserNameForInquiry = $userName; // Use provided name by default

    // Optional: Check if user is logged in and associate inquiry
    if (isset($_SERVER['HTTP_AUTHORIZATION']) && $jwtKey) {
        $authHeader = $_SERVER['HTTP_AUTHORIZATION'];
        // Check if header format is Bearer <token>
        if (preg_match('/Bearer\s(\S+)/', $authHeader, $matches)) {
            $token = $matches[1];
            try {
                // We don't need to restrict roles here, just get user info if token is valid
                $decoded = JWT::decode($token, new Key($jwtKey, 'HS256'));
                if (isset($decoded->data) && isset($decoded->data->userId)) {
                    $loggedInUserId = $decoded->data->userId;
                    // If userName was not provided in the form, but user is logged in, use their token name
                    if (empty($userName) && isset($decoded->data->name)) {
                        $loggedInUserNameForInquiry = $decoded->data->name;
                    }
                }
            } catch (Exception $e) {
                // Token invalid or expired, but inquiry can still be submitted anonymously/by guest
                error_log("Optional JWT for inquiry submission was invalid: " . $e->getMessage());
            }
        }
    }


    try {
        $inquiryId = generateUniqueId('inq_'); // From helpers.php

        $stmt = $pdo->prepare("INSERT INTO user_inquiries (id, user_id, user_name, user_email, subject, message, category, priority, status) 
                               VALUES (:id, :user_id, :user_name, :user_email, :subject, :message, :category, :priority, 'open')");
        
        $stmt->bindParam(':id', $inquiryId);
        $stmt->bindParam(':user_id', $loggedInUserId, PDO::PARAM_STR); // Can be NULL
        $stmt->bindParam(':user_name', $loggedInUserNameForInquiry);
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
}

// --- Handle GET Request: Fetch inquiries (Admin only) ---
elseif ($method === 'GET') {
    if (!$jwtKey) sendJsonResponse(['status' => 'error', 'message' => 'Server JWT configuration missing.'], 500);
    $adminData = authenticateAdmin($jwtKey); // Uses helper, ensures ADMIN role

    // Pagination and filtering parameters
    $page = isset($_GET['page']) ? max(1, (int)$_GET['page']) : 1;
    $limit = isset($_GET['limit']) ? max(1, min(100, (int)$_GET['limit'])) : 25;
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
        $countSql = "SELECT COUNT(*) FROM user_inquiries" . $sqlWhere;
        $countStmt = $pdo->prepare($countSql);
        $countStmt->execute($params);
        $totalItems = (int)$countStmt->fetchColumn();
        $totalPages = ceil($totalItems / $limit);

        $mainSql = "SELECT * FROM user_inquiries" . $sqlWhere . $sqlOrder . " LIMIT :limit OFFSET :offset";
        
        $stmt = $pdo->prepare($mainSql);
        foreach ($params as $key => $value) {
            $stmt->bindValue($key, $value);
        }
        $stmt->bindParam(':limit', $limit, PDO::PARAM_INT);
        $stmt->bindParam(':offset', $offset, PDO::PARAM_INT);
        $stmt->execute();
        $inquiries = $stmt->fetchAll(PDO::FETCH_ASSOC);

        sendJsonResponse([
            'status' => 'success',
            'data' => $inquiries, // Key 'data' matches AdminDashboardPage.tsx
            'pagination' => [
                'currentPage' => $page,
                'totalPages' => $totalPages,
                'totalItems' => $totalItems,
                'itemsPerPage' => $limit
            ]
        ], 200);

    } catch (PDOException $e) {
        error_log("Database error fetching inquiries for admin: " . $e->getMessage());
        sendJsonResponse(['status' => 'error', 'message' => 'Failed to fetch inquiries.'], 500);
    }
}

// --- Handle PUT Request: Update an inquiry (Admin only) ---
elseif ($method === 'PUT') {
    if (!$jwtKey) sendJsonResponse(['status' => 'error', 'message' => 'Server JWT configuration missing.'], 500);
    $adminData = authenticateAdmin($jwtKey); // Uses helper, ensures ADMIN role

    $input = json_decode(file_get_contents('php://input'), true);
    if (json_last_error() !== JSON_ERROR_NONE || !isset($input['id'])) {
        sendJsonResponse(['status' => 'error', 'message' => 'Invalid JSON input or missing inquiry ID.'], 400);
    }

    $inquiryId = trim($input['id']);
    $newStatus = isset($input['status']) ? trim($input['status']) : null;
    $adminReply = array_key_exists('adminReply', $input) ? trim($input['adminReply']) : null; // Allow empty string to clear reply
    $newPriority = isset($input['priority']) ? trim($input['priority']) : null;

    if (empty($inquiryId)) {
        sendJsonResponse(['status' => 'error', 'message' => 'Inquiry ID is required.'], 400);
    }
    
    $allowedStatuses = ['open', 'closed', 'pending_admin_response', 'escalated'];
    if ($newStatus && !in_array($newStatus, $allowedStatuses)) {
        sendJsonResponse(['status' => 'error', 'message' => 'Invalid status provided.'], 400);
    }
    $allowedPriorities = ['low', 'medium', 'high'];
    if ($newPriority && !in_array($newPriority, $allowedPriorities)) {
        sendJsonResponse(['status' => 'error', 'message' => 'Invalid priority provided.'], 400);
    }

    try {
        $stmtFetch = $pdo->prepare("SELECT * FROM user_inquiries WHERE id = :id");
        $stmtFetch->bindParam(':id', $inquiryId);
        $stmtFetch->execute();
        $currentInquiry = $stmtFetch->fetch(PDO::FETCH_ASSOC);

        if (!$currentInquiry) {
            sendJsonResponse(['status' => 'error', 'message' => 'Inquiry not found.'], 404);
        }

        $updateFields = [];
        $params = [':id' => $inquiryId];

        if ($newStatus !== null && $newStatus !== $currentInquiry['status']) {
            $updateFields[] = "status = :status"; $params[':status'] = $newStatus;
        }
        if ($adminReply !== null && $adminReply !== $currentInquiry['admin_reply']) { // Check if different, allow empty string
            $updateFields[] = "admin_reply = :admin_reply"; $params[':admin_reply'] = $adminReply;
        }
        if ($newPriority !== null && $newPriority !== $currentInquiry['priority']) {
            $updateFields[] = "priority = :priority"; $params[':priority'] = $newPriority;
        }

        if (count($updateFields) === 0) {
            sendJsonResponse(['status' => 'success', 'message' => 'No changes detected for inquiry.', 'inquiry' => $currentInquiry], 200);
        }
        
        $updateFields[] = "updated_at = NOW()"; // Add if you have an updated_at column in user_inquiries (schema doesn't show one, good to add)

        $sql = "UPDATE user_inquiries SET " . implode(", ", $updateFields) . " WHERE id = :id";
        $stmtUpdate = $pdo->prepare($sql);
        
        if ($stmtUpdate->execute($params)) {
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
}

// --- Invalid Method ---
else {
    sendJsonResponse(['status' => 'error', 'message' => 'Invalid request method for admin/inquiries.'], 405);
}
?>