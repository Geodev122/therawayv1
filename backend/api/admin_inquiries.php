<?php
// backend/api/admin_inquiries.php

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
        error_log("JWT_SECRET_KEY is not defined in core.php for admin_inquiries.php");
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


    // --- Handle GET Request: Fetch inquiries (Admin only) ---
    if ($method === 'GET') {
        $adminData = authenticateAdmin($jwtKey);

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
                'data' => $inquiries, // Key 'data' to match AdminDashboardPage.tsx
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
    }

    // --- Invalid Method ---
    else {
        sendJsonResponse(['status' => 'error', 'message' => 'Invalid request method for admin/inquiries.'], 405);
    }
} catch (Throwable $e) {
    // Log the error and send a clean JSON response
    error_log("Unhandled error in admin_inquiries.php: " . $e->getMessage());
    error_log("Stack trace: " . $e->getTraceAsString());
    sendJsonResponse(['status' => 'error', 'message' => 'An unexpected error occurred.'], 500);
}
?>