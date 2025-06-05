<?php
// backend/api/admin_dashboard.php

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
        error_log("JWT_SECRET_KEY is not defined in core.php for admin_dashboard.php");
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
            error_log("JWT Decode Error for admin_dashboard: " . $e->getMessage());
            sendJsonResponse(['status' => 'error', 'message' => 'Invalid token: ' . $e->getMessage()], 401);
        }
    }

    // --- Handle GET Request: Fetch dashboard summary data ---
    if ($method === 'GET') {
        $adminData = authenticateAdmin($jwtKey);

        try {
            // Get therapist statistics
            $therapistStmt = $pdo->prepare("
                SELECT 
                    COUNT(*) as total,
                    SUM(CASE WHEN account_status = 'live' THEN 1 ELSE 0 END) as active,
                    SUM(CASE WHEN account_status = 'draft' THEN 1 ELSE 0 END) as draft,
                    SUM(CASE WHEN account_status = 'pending_approval' THEN 1 ELSE 0 END) as pending,
                    SUM(CASE WHEN account_status = 'rejected' THEN 1 ELSE 0 END) as rejected
                FROM therapists_data
            ");
            $therapistStmt->execute();
            $therapistStats = $therapistStmt->fetch(PDO::FETCH_ASSOC);

            // Get clinic statistics
            $clinicStmt = $pdo->prepare("
                SELECT 
                    COUNT(*) as total,
                    SUM(CASE WHEN account_status = 'live' THEN 1 ELSE 0 END) as active,
                    SUM(CASE WHEN account_status = 'draft' THEN 1 ELSE 0 END) as draft,
                    SUM(CASE WHEN account_status = 'pending_approval' THEN 1 ELSE 0 END) as pending,
                    SUM(CASE WHEN account_status = 'rejected' THEN 1 ELSE 0 END) as rejected
                FROM clinics_data
            ");
            $clinicStmt->execute();
            $clinicStats = $clinicStmt->fetch(PDO::FETCH_ASSOC);

            // Get inquiry statistics
            $inquiryStmt = $pdo->prepare("
                SELECT 
                    COUNT(*) as total,
                    SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) as open,
                    SUM(CASE WHEN status = 'closed' THEN 1 ELSE 0 END) as closed,
                    SUM(CASE WHEN status = 'pending_admin_response' THEN 1 ELSE 0 END) as pending,
                    SUM(CASE WHEN status = 'escalated' THEN 1 ELSE 0 END) as escalated
                FROM user_inquiries
            ");
            $inquiryStmt->execute();
            $inquiryStats = $inquiryStmt->fetch(PDO::FETCH_ASSOC);

            // Get recent activity logs
            $logStmt = $pdo->prepare("
                SELECT * FROM activity_logs
                ORDER BY timestamp DESC
                LIMIT 10
            ");
            $logStmt->execute();
            $recentLogs = $logStmt->fetchAll(PDO::FETCH_ASSOC);

            // Process logs to decode JSON details
            foreach ($recentLogs as &$log) {
                if (isset($log['details']) && $log['details'] !== null) {
                    $decodedDetails = json_decode($log['details'], true);
                    if (json_last_error() === JSON_ERROR_NONE) {
                        $log['details'] = $decodedDetails;
                    }
                }
            }
            unset($log); // Unset reference

            // Combine all data
            $dashboardData = [
                'therapistStats' => $therapistStats,
                'clinicStats' => $clinicStats,
                'inquiryStats' => $inquiryStats,
                'recentActivity' => $recentLogs
            ];

            sendJsonResponse([
                'status' => 'success',
                'data' => $dashboardData
            ], 200);

        } catch (PDOException $e) {
            error_log("Database error fetching admin dashboard data: " . $e->getMessage());
            sendJsonResponse(['status' => 'error', 'message' => 'Failed to fetch dashboard data.'], 500);
        }
    }

    // --- Invalid Method ---
    else {
        sendJsonResponse(['status' => 'error', 'message' => 'Invalid request method for admin/dashboard.'], 405);
    }
} catch (Throwable $e) {
    // Log the error and send a clean JSON response
    error_log("Unhandled error in admin_dashboard.php: " . $e->getMessage());
    error_log("Stack trace: " . $e->getTraceAsString());
    sendJsonResponse(['status' => 'error', 'message' => 'An unexpected error occurred.'], 500);
}
?>