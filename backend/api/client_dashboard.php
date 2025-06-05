<?php
// backend/api/client_dashboard.php

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
        error_log("JWT_SECRET_KEY is not defined in core.php for client_dashboard.php");
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
            error_log("JWT Decode Error for client_dashboard: " . $e->getMessage());
            sendJsonResponse(['status' => 'error', 'message' => 'Invalid token: ' . $e->getMessage()], 401);
        }
        exit;
    }

    // --- Handle GET Request: Fetch client dashboard data ---
    if ($method === 'GET') {
        $authData = getAuthenticatedClient($jwtKey);
        $clientUserId = $authData['userId'];

        try {
            // Get client profile
            $profileStmt = $pdo->prepare("
                SELECT id, name, email, profile_picture_url, created_at
                FROM users
                WHERE id = :client_id AND role = 'CLIENT'
            ");
            $profileStmt->bindParam(':client_id', $clientUserId);
            $profileStmt->execute();
            $profile = $profileStmt->fetch(PDO::FETCH_ASSOC);

            if (!$profile) {
                sendJsonResponse(['status' => 'error', 'message' => 'Client profile not found.'], 404);
            }

            // Get favorite therapists count
            $favoritesStmt = $pdo->prepare("
                SELECT COUNT(*) as count
                FROM client_therapist_favorites
                WHERE client_user_id = :client_id
            ");
            $favoritesStmt->bindParam(':client_id', $clientUserId);
            $favoritesStmt->execute();
            $favoritesCount = (int)$favoritesStmt->fetchColumn();

            // Get recent inquiries
            $inquiriesStmt = $pdo->prepare("
                SELECT id, subject, status, date
                FROM user_inquiries
                WHERE user_id = :client_id
                ORDER BY date DESC
                LIMIT 5
            ");
            $inquiriesStmt->bindParam(':client_id', $clientUserId);
            $inquiriesStmt->execute();
            $recentInquiries = $inquiriesStmt->fetchAll(PDO::FETCH_ASSOC);

            // Get recent reviews
            $reviewsStmt = $pdo->prepare("
                SELECT r.id, r.rating, r.comment, r.created_at, 
                       u.name as therapist_name, u.profile_picture_url as therapist_profile_picture_url
                FROM therapist_reviews r
                JOIN users u ON r.therapist_id = u.id
                WHERE r.client_id = :client_id
                ORDER BY r.created_at DESC
                LIMIT 5
            ");
            $reviewsStmt->bindParam(':client_id', $clientUserId);
            $reviewsStmt->execute();
            $recentReviews = $reviewsStmt->fetchAll(PDO::FETCH_ASSOC);

            // Format reviews for frontend
            $formattedReviews = [];
            foreach ($recentReviews as $review) {
                $formattedReviews[] = [
                    'id' => $review['id'],
                    'therapistName' => $review['therapist_name'],
                    'therapistProfilePictureUrl' => $review['therapist_profile_picture_url'],
                    'rating' => (float)$review['rating'],
                    'comment' => $review['comment'],
                    'createdAt' => $review['created_at']
                ];
            }

            // Combine all data
            $dashboardData = [
                'profile' => [
                    'id' => $profile['id'],
                    'name' => $profile['name'],
                    'email' => $profile['email'],
                    'profilePictureUrl' => $profile['profile_picture_url'],
                    'memberSince' => $profile['created_at']
                ],
                'stats' => [
                    'favoriteTherapistsCount' => $favoritesCount,
                    'inquiriesCount' => count($recentInquiries),
                    'reviewsCount' => count($formattedReviews)
                ],
                'recentActivity' => [
                    'inquiries' => $recentInquiries,
                    'reviews' => $formattedReviews
                ]
            ];

            sendJsonResponse([
                'status' => 'success',
                'dashboard' => $dashboardData
            ], 200);
        } catch (PDOException $e) {
            error_log("Database error fetching client dashboard: " . $e->getMessage());
            sendJsonResponse(['status' => 'error', 'message' => 'Failed to fetch dashboard data.'], 500);
        }
    }

    // --- Invalid Method ---
    else {
        sendJsonResponse(['status' => 'error', 'message' => 'Invalid request method for client dashboard.'], 405);
    }
} catch (Throwable $e) {
    // Log the error and send a clean JSON response
    error_log("Unhandled error in client_dashboard.php: " . $e->getMessage());
    error_log("Stack trace: " . $e->getTraceAsString());
    sendJsonResponse(['status' => 'error', 'message' => 'An unexpected error occurred.'], 500);
}
?>