<?php
// backend/api/client_inquiries.php

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

    if (!$jwtKey && $method !== 'POST') { // POST can be anonymous, other methods require auth
        error_log("JWT_SECRET_KEY is not defined in core.php for client_inquiries.php");
        sendJsonResponse(['status' => 'error', 'message' => 'Server configuration error (JWT).'], 500);
    }

    /**
     * Helper function to get authenticated user ID and role from JWT.
     * @param string $jwtKey The JWT secret key.
     * @return array ['userId' => string, 'role' => string, 'name' => string] or exits.
     */
    function getAuthenticatedUser(string $jwtKey): array {
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
            $userName = isset($decoded->data->name) ? $decoded->data->name : 'User';
            return ['userId' => $decoded->data->userId, 'role' => $decoded->data->role, 'name' => $userName];
        } catch (ExpiredException $e) {
            sendJsonResponse(['status' => 'error', 'message' => 'Token has expired.'], 401);
        } catch (SignatureInvalidException $e) {
            sendJsonResponse(['status' => 'error', 'message' => 'Token signature invalid.'], 401);
        } catch (BeforeValidException $e) {
            sendJsonResponse(['status' => 'error', 'message' => 'Token not yet valid.'], 401);
        } catch (Exception $e) {
            error_log("JWT Decode Error for client_inquiries: " . $e->getMessage());
            sendJsonResponse(['status' => 'error', 'message' => 'Invalid token: ' . $e->getMessage()], 401);
        }
        exit;
    }

    // --- Handle POST Request: Submit a new inquiry (can be anonymous or authenticated) ---
    if ($method === 'POST') {
        $input = json_decode(file_get_contents('php://input'), true);

        if (json_last_error() !== JSON_ERROR_NONE) {
            sendJsonResponse(['status' => 'error', 'message' => 'Invalid JSON input.'], 400);
        }

        $userName = trim($input['userName'] ?? '');
        $userEmail = filter_var(trim($input['userEmail'] ?? ''), FILTER_SANITIZE_EMAIL);
        $subject = trim($input['subject'] ?? '');
        $message = trim($input['message'] ?? '');
        $category = isset($input['category']) ? trim($input['category']) : 'general';
        $priority = isset($input['priority']) ? trim($input['priority']) : 'medium';

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

        // Validate category and priority
        $allowedCategories = ['general', 'technical_support', 'billing', 'feedback'];
        if (!in_array($category, $allowedCategories)) {
            $category = 'general'; // Default if invalid
        }
        $allowedPriorities = ['low', 'medium', 'high'];
        if (!in_array($priority, $allowedPriorities)) {
            $priority = 'medium'; // Default if invalid
        }

        // Check if user is authenticated
        $userId = null;
        $authenticatedUserName = null;
        if (isset($_SERVER['HTTP_AUTHORIZATION']) && $jwtKey) {
            try {
                $authData = getAuthenticatedUser($jwtKey);
                $userId = $authData['userId'];
                $authenticatedUserName = $authData['name'];
                
                // If userName is empty but user is authenticated, use their name from token
                if (empty($userName)) {
                    $userName = $authenticatedUserName;
                }
            } catch (Exception $e) {
                // Authentication failed, but we'll still allow anonymous submissions
                error_log("Optional authentication failed in client_inquiries.php: " . $e->getMessage());
            }
        }

        try {
            $inquiryId = 'inq_' . generateUniqueId();

            $stmt = $pdo->prepare("
                INSERT INTO user_inquiries (
                    id, user_id, user_name, user_email, subject, message, 
                    category, priority, status, date
                ) VALUES (
                    :id, :user_id, :user_name, :user_email, :subject, :message, 
                    :category, :priority, 'open', NOW()
                )
            ");
            
            $stmt->bindParam(':id', $inquiryId);
            $stmt->bindParam(':user_id', $userId);
            $stmt->bindParam(':user_name', $userName);
            $stmt->bindParam(':user_email', $userEmail);
            $stmt->bindParam(':subject', $subject);
            $stmt->bindParam(':message', $message);
            $stmt->bindParam(':category', $category);
            $stmt->bindParam(':priority', $priority);

            if ($stmt->execute()) {
                // Log the inquiry submission in activity_logs
                if ($userId) {
                    $logId = 'alog_' . generateUniqueId();
                    $logStmt = $pdo->prepare("
                        INSERT INTO activity_logs (
                            id, timestamp, user_id, user_name, user_role, action, 
                            target_id, target_type, details
                        ) VALUES (
                            :id, NOW(), :user_id, :user_name, :user_role, 'SUBMITTED_INQUIRY', 
                            :target_id, 'user_inquiry', :details
                        )
                    ");
                    $logStmt->bindParam(':id', $logId);
                    $logStmt->bindParam(':user_id', $userId);
                    $logStmt->bindParam(':user_name', $userName);
                    $logStmt->bindParam(':user_role', $authData['role']);
                    $logStmt->bindParam(':target_id', $inquiryId);
                    $logStmt->bindParam(':details', json_encode(['subject' => $subject, 'category' => $category]));
                    $logStmt->execute();
                }

                sendJsonResponse([
                    'status' => 'success',
                    'message' => 'Inquiry submitted successfully.',
                    'inquiryId' => $inquiryId
                ], 201);
            } else {
                error_log("Failed to insert inquiry for email: " . $userEmail);
                sendJsonResponse(['status' => 'error', 'message' => 'Failed to submit inquiry.'], 500);
            }
        } catch (PDOException $e) {
            error_log("Database error submitting inquiry: " . $e->getMessage());
            sendJsonResponse(['status' => 'error', 'message' => 'A server error occurred while submitting your inquiry.'], 500);
        }
    }

    // --- Handle GET Request: Fetch client's own inquiries ---
    elseif ($method === 'GET') {
        $authData = getAuthenticatedUser($jwtKey);
        $clientUserId = $authData['userId'];

        try {
            $stmt = $pdo->prepare("
                SELECT * FROM user_inquiries 
                WHERE user_id = :user_id 
                ORDER BY date DESC
            ");
            $stmt->bindParam(':user_id', $clientUserId);
            $stmt->execute();
            $inquiries = $stmt->fetchAll(PDO::FETCH_ASSOC);

            sendJsonResponse([
                'status' => 'success',
                'inquiries' => $inquiries
            ], 200);
        } catch (PDOException $e) {
            error_log("Database error fetching client inquiries: " . $e->getMessage());
            sendJsonResponse(['status' => 'error', 'message' => 'Failed to fetch inquiries.'], 500);
        }
    }

    // --- Invalid Method ---
    else {
        sendJsonResponse(['status' => 'error', 'message' => 'Invalid request method for client inquiries.'], 405);
    }
} catch (Throwable $e) {
    // Log the error and send a clean JSON response
    error_log("Unhandled error in client_inquiries.php: " . $e->getMessage());
    error_log("Stack trace: " . $e->getTraceAsString());
    sendJsonResponse(['status' => 'error', 'message' => 'An unexpected error occurred.'], 500);
}
?>