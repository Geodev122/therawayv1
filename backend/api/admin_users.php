<?php
// backend/api/admin_users.php

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
        error_log("JWT_SECRET_KEY is not defined in core.php for admin_users.php");
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
            return (array)$decoded->data;
        } catch (ExpiredException $e) {
            sendJsonResponse(['status' => 'error', 'message' => 'Token has expired.'], 401);
        } catch (SignatureInvalidException $e) {
            sendJsonResponse(['status' => 'error', 'message' => 'Token signature invalid.'], 401);
        } catch (BeforeValidException $e) {
            sendJsonResponse(['status' => 'error', 'message' => 'Token not yet valid.'], 401);
        } catch (Exception $e) {
            error_log("JWT Decode Error for admin_users: " . $e->getMessage());
            sendJsonResponse(['status' => 'error', 'message' => 'Invalid token: ' . $e->getMessage()], 401);
        }
    }

    // --- Handle GET Request: Fetch users list ---
    if ($method === 'GET') {
        $adminData = authenticateAdmin($jwtKey);

        // Pagination and filtering parameters
        $page = isset($_GET['page']) ? max(1, (int)$_GET['page']) : 1;
        $limit = isset($_GET['limit']) ? max(1, min(100, (int)$_GET['limit'])) : 25;
        $offset = ($page - 1) * $limit;
        
        $roleFilter = isset($_GET['role']) ? trim($_GET['role']) : null;
        $searchTerm = isset($_GET['searchTerm']) ? trim($_GET['searchTerm']) : null;

        $whereClauses = [];
        $params = [];

        if ($roleFilter && in_array($roleFilter, ['CLIENT', 'THERAPIST', 'CLINIC_OWNER', 'ADMIN'])) {
            $whereClauses[] = "role = :role";
            $params[':role'] = $roleFilter;
        }
        if ($searchTerm) {
            $whereClauses[] = "(name LIKE :searchTerm OR email LIKE :searchTerm OR id LIKE :searchTerm)";
            $params[':searchTerm'] = "%{$searchTerm}%";
        }

        $sqlWhere = count($whereClauses) > 0 ? " WHERE " . implode(" AND ", $whereClauses) : "";
        $sqlOrder = " ORDER BY created_at DESC"; // Newest first

        try {
            $countSql = "SELECT COUNT(*) FROM users" . $sqlWhere;
            $countStmt = $pdo->prepare($countSql);
            $countStmt->execute($params);
            $totalItems = (int)$countStmt->fetchColumn();
            $totalPages = ceil($totalItems / $limit);

            $mainSql = "SELECT id, name, email, role, profile_picture_url, created_at, updated_at FROM users" . $sqlWhere . $sqlOrder . " LIMIT :limit OFFSET :offset";
            
            $stmt = $pdo->prepare($mainSql);
            foreach ($params as $key => $value) {
                $stmt->bindValue($key, $value);
            }
            $stmt->bindParam(':limit', $limit, PDO::PARAM_INT);
            $stmt->bindParam(':offset', $offset, PDO::PARAM_INT);
            $stmt->execute();
            $users = $stmt->fetchAll(PDO::FETCH_ASSOC);

            // Format for frontend
            $formattedUsers = [];
            foreach ($users as $user) {
                $formattedUsers[] = [
                    'id' => $user['id'],
                    'name' => $user['name'],
                    'email' => $user['email'],
                    'role' => $user['role'],
                    'profilePictureUrl' => $user['profile_picture_url'],
                    'isActive' => true, // Assuming all users are active by default
                    'lastLogin' => null // We don't track this yet
                ];
            }

            sendJsonResponse([
                'status' => 'success',
                'data' => $formattedUsers,
                'pagination' => [
                    'currentPage' => $page,
                    'totalPages' => $totalPages,
                    'totalItems' => $totalItems,
                    'itemsPerPage' => $limit
                ]
            ], 200);

        } catch (PDOException $e) {
            error_log("Database error fetching users for admin: " . $e->getMessage());
            sendJsonResponse(['status' => 'error', 'message' => 'Failed to fetch user data.'], 500);
        }
    }

    // --- Handle PUT Request: Update user status ---
    elseif ($method === 'PUT') {
        $adminData = authenticateAdmin($jwtKey);

        $input = json_decode(file_get_contents('php://input'), true);
        if (json_last_error() !== JSON_ERROR_NONE || !isset($input['id'])) {
            sendJsonResponse(['status' => 'error', 'message' => 'Invalid JSON input or missing user ID.'], 400);
        }

        $userId = trim($input['id']);
        $isActive = isset($input['isActive']) ? (bool)$input['isActive'] : null;
        $newRole = isset($input['role']) ? trim($input['role']) : null;

        if (empty($userId)) {
            sendJsonResponse(['status' => 'error', 'message' => 'User ID is required.'], 400);
        }
        
        // Validate role if provided
        if ($newRole !== null && !in_array($newRole, ['CLIENT', 'THERAPIST', 'CLINIC_OWNER', 'ADMIN'])) {
            sendJsonResponse(['status' => 'error', 'message' => 'Invalid role provided.'], 400);
        }

        try {
            // Check if user exists and get current data
            $checkStmt = $pdo->prepare("SELECT id, role FROM users WHERE id = :id");
            $checkStmt->bindParam(':id', $userId);
            $checkStmt->execute();
            $user = $checkStmt->fetch(PDO::FETCH_ASSOC);

            if (!$user) {
                sendJsonResponse(['status' => 'error', 'message' => 'User not found.'], 404);
            }

            // Prevent changing own role (admin can't demote themselves)
            if ($userId === $adminData['userId'] && $newRole !== null && $newRole !== 'ADMIN') {
                sendJsonResponse(['status' => 'error', 'message' => 'Cannot change your own admin role.'], 403);
            }

            $updateFields = [];
            $params = [':id' => $userId];

            // For now, we don't have an 'is_active' column, but we could add one
            // if ($isActive !== null) { $updateFields[] = "is_active = :is_active"; $params[':is_active'] = $isActive; }
            
            if ($newRole !== null && $newRole !== $user['role']) {
                $updateFields[] = "role = :role";
                $params[':role'] = $newRole;
            }

            if (count($updateFields) === 0) {
                sendJsonResponse(['status' => 'success', 'message' => 'No changes detected.'], 200);
            }

            $pdo->beginTransaction();

            // Update user
            $sql = "UPDATE users SET " . implode(", ", $updateFields) . ", updated_at = NOW() WHERE id = :id";
            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);

            // If role changed, we might need to create or update role-specific data
            if ($newRole !== null && $newRole !== $user['role']) {
                // If changing to THERAPIST, create therapists_data entry if it doesn't exist
                if ($newRole === 'THERAPIST') {
                    $checkTherapistStmt = $pdo->prepare("SELECT user_id FROM therapists_data WHERE user_id = :user_id");
                    $checkTherapistStmt->bindParam(':user_id', $userId);
                    $checkTherapistStmt->execute();
                    if (!$checkTherapistStmt->fetch()) {
                        $createTherapistStmt = $pdo->prepare("INSERT INTO therapists_data (user_id, account_status) VALUES (:user_id, 'draft')");
                        $createTherapistStmt->bindParam(':user_id', $userId);
                        $createTherapistStmt->execute();
                    }
                }
                
                // If changing to CLINIC_OWNER, create clinics_data entry if it doesn't exist
                if ($newRole === 'CLINIC_OWNER') {
                    $checkClinicStmt = $pdo->prepare("SELECT user_id FROM clinics_data WHERE user_id = :user_id");
                    $checkClinicStmt->bindParam(':user_id', $userId);
                    $checkClinicStmt->execute();
                    if (!$checkClinicStmt->fetch()) {
                        $clinicId = 'clinic_' . generateUniqueId();
                        $userName = $pdo->prepare("SELECT name FROM users WHERE id = :id");
                        $userName->bindParam(':id', $userId);
                        $userName->execute();
                        $nameRow = $userName->fetch(PDO::FETCH_ASSOC);
                        $clinicName = ($nameRow ? $nameRow['name'] : 'New') . "'s Clinic";
                        
                        $createClinicStmt = $pdo->prepare("INSERT INTO clinics_data (user_id, clinic_id, clinic_name, account_status) VALUES (:user_id, :clinic_id, :clinic_name, 'draft')");
                        $createClinicStmt->bindParam(':user_id', $userId);
                        $createClinicStmt->bindParam(':clinic_id', $clinicId);
                        $createClinicStmt->bindParam(':clinic_name', $clinicName);
                        $createClinicStmt->execute();
                    }
                }
            }

            // Log the action
            $logId = 'alog_' . generateUniqueId();
            $actionDescription = "User role changed from {$user['role']} to {$newRole} by Admin";
            $logStmt = $pdo->prepare("
                INSERT INTO activity_logs (id, timestamp, user_id, user_name, user_role, action, target_id, target_type, details)
                VALUES (:id, NOW(), :admin_id, :admin_name, 'ADMIN', :action, :target_id, 'user', :details)
            ");
            $logStmt->bindParam(':id', $logId);
            $logStmt->bindParam(':admin_id', $adminData['userId']);
            $logStmt->bindParam(':admin_name', $adminData['name']);
            $logStmt->bindParam(':action', $actionDescription);
            $logStmt->bindParam(':target_id', $userId);
            $logStmt->bindParam(':details', json_encode(['oldRole' => $user['role'], 'newRole' => $newRole]));
            $logStmt->execute();

            $pdo->commit();

            // Fetch updated user data
            $updatedStmt = $pdo->prepare("SELECT id, name, email, role, profile_picture_url, created_at, updated_at FROM users WHERE id = :id");
            $updatedStmt->bindParam(':id', $userId);
            $updatedStmt->execute();
            $updatedUser = $updatedStmt->fetch(PDO::FETCH_ASSOC);

            // Format for frontend
            $formattedUser = [
                'id' => $updatedUser['id'],
                'name' => $updatedUser['name'],
                'email' => $updatedUser['email'],
                'role' => $updatedUser['role'],
                'profilePictureUrl' => $updatedUser['profile_picture_url'],
                'isActive' => true, // Assuming all users are active by default
                'lastLogin' => null // We don't track this yet
            ];

            sendJsonResponse([
                'status' => 'success',
                'message' => 'User updated successfully.',
                'user' => $formattedUser
            ], 200);

        } catch (PDOException $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            error_log("Database error updating user for admin: " . $e->getMessage());
            sendJsonResponse(['status' => 'error', 'message' => 'A server error occurred while updating user data.'], 500);
        }
    }

    // --- Invalid Method ---
    else {
        sendJsonResponse(['status' => 'error', 'message' => 'Invalid request method for admin/users.'], 405);
    }
} catch (Throwable $e) {
    // Log the error and send a clean JSON response
    error_log("Unhandled error in admin_users.php: " . $e->getMessage());
    error_log("Stack trace: " . $e->getTraceAsString());
    sendJsonResponse(['status' => 'error', 'message' => 'An unexpected error occurred.'], 500);
}
?>