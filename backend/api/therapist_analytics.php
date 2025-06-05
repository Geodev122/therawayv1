<?php
// backend/api/therapist_analytics.php

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
        error_log("JWT_SECRET_KEY is not defined in core.php for therapist_analytics.php");
        sendJsonResponse(['status' => 'error', 'message' => 'Server configuration error (JWT).'], 500);
    }

    /**
     * Helper function to get authenticated user ID and role from JWT.
     * @param string $jwtKey The JWT secret key.
     * @param array $allowedRoles Array of roles allowed to perform the action.
     * @return array ['userId' => string, 'role' => string] or exits.
     */
    function getAuthenticatedUser(string $jwtKey, array $allowedRoles = ['THERAPIST', 'ADMIN']): array {
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
            if (!in_array($decoded->data->role, $allowedRoles)) {
                sendJsonResponse(['status' => 'error', 'message' => 'Access denied. Required role: ' . implode(' or ', $allowedRoles) . '.'], 403);
            }
            return ['userId' => $decoded->data->userId, 'role' => $decoded->data->role];
        } catch (ExpiredException $e) {
            sendJsonResponse(['status' => 'error', 'message' => 'Token has expired.'], 401);
        } catch (SignatureInvalidException $e) {
            sendJsonResponse(['status' => 'error', 'message' => 'Token signature invalid.'], 401);
        } catch (BeforeValidException $e) {
            sendJsonResponse(['status' => 'error', 'message' => 'Token not yet valid.'], 401);
        } catch (Exception $e) {
            error_log("JWT Decode Error for therapist_analytics: " . $e->getMessage());
            sendJsonResponse(['status' => 'error', 'message' => 'Invalid token: ' . $e->getMessage()], 401);
        }
        exit;
    }

    // --- Handle GET Request: Fetch therapist analytics ---
    if ($method === 'GET') {
        $authData = getAuthenticatedUser($jwtKey, ['THERAPIST', 'ADMIN']);
        $loggedInUserId = $authData['userId'];
        $loggedInUserRole = $authData['role'];

        $therapistIdToFetch = $_GET['userId'] ?? null;

        if (empty($therapistIdToFetch)) {
            sendJsonResponse(['status' => 'error', 'message' => 'Therapist User ID is required.'], 400);
        }

        // Authorization: If logged-in user is a THERAPIST, they can only fetch their own analytics
        if ($loggedInUserRole === 'THERAPIST' && $therapistIdToFetch !== $loggedInUserId) {
            sendJsonResponse(['status' => 'error', 'message' => 'Unauthorized to view analytics for this therapist.'], 403);
        }

        try {
            // Verify the therapist exists
            $stmtCheckTherapist = $pdo->prepare("
                SELECT u.name, td.profile_views, td.likes_count, td.rating, td.review_count
                FROM users u
                JOIN therapists_data td ON u.id = td.user_id
                WHERE u.id = :therapist_id AND u.role = 'THERAPIST'
            ");
            $stmtCheckTherapist->bindParam(':therapist_id', $therapistIdToFetch);
            $stmtCheckTherapist->execute();
            $therapistData = $stmtCheckTherapist->fetch(PDO::FETCH_ASSOC);

            if (!$therapistData) {
                sendJsonResponse(['status' => 'error', 'message' => 'Therapist not found.'], 404);
            }

            // Get profile view data from activity logs (if tracked)
            $stmtViews = $pdo->prepare("
                SELECT COUNT(*) as view_count, DATE(timestamp) as view_date
                FROM activity_logs
                WHERE target_id = :therapist_id AND target_type = 'therapist' AND action = 'VIEW_PROFILE'
                GROUP BY DATE(timestamp)
                ORDER BY view_date DESC
                LIMIT 30
            ");
            $stmtViews->bindParam(':therapist_id', $therapistIdToFetch);
            $stmtViews->execute();
            $viewsData = $stmtViews->fetchAll(PDO::FETCH_ASSOC);

            // Prepare analytics data
            $analyticsData = [
                'therapistId' => $therapistIdToFetch,
                'therapistName' => $therapistData['name'],
                'profileViews' => (int)($therapistData['profile_views'] ?? 0),
                'likesCount' => (int)($therapistData['likes_count'] ?? 0),
                'rating' => (float)($therapistData['rating'] ?? 0),
                'reviewCount' => (int)($therapistData['review_count'] ?? 0),
                'estimatedConnections' => round((int)($therapistData['profile_views'] ?? 0) * 0.15), // Example calculation
                'viewsOverTime' => $viewsData,
                'dataLastUpdated' => date(DateTime::ATOM)
            ];

            sendJsonResponse(['status' => 'success', 'analytics' => $analyticsData], 200);

        } catch (PDOException $e) {
            error_log("Database error fetching therapist analytics: " . $e->getMessage());
            sendJsonResponse(['status' => 'error', 'message' => 'A server error occurred while fetching analytics.'], 500);
        }
    }

    // --- Invalid Method ---
    else {
        sendJsonResponse(['status' => 'error', 'message' => 'Invalid request method. Only GET is accepted for this endpoint.'], 405);
    }
} catch (Throwable $e) {
    // Log the error and send a clean JSON response
    error_log("Unhandled error in therapist_analytics.php: " . $e->getMessage());
    error_log("Stack trace: " . $e->getTraceAsString());
    sendJsonResponse(['status' => 'error', 'message' => 'An unexpected error occurred.'], 500);
}
?>