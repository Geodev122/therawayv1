<?php
// backend/api/client_reviews.php

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
        error_log("JWT_SECRET_KEY is not defined in core.php for client_reviews.php");
        sendJsonResponse(['status' => 'error', 'message' => 'Server configuration error (JWT).'], 500);
    }

    /**
     * Helper function to get authenticated user ID and role from JWT.
     * @param string $jwtKey The JWT secret key.
     * @return array ['userId' => string, 'role' => string, 'name' => string] or exits.
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
            $userName = isset($decoded->data->name) ? $decoded->data->name : 'Client';
            return ['userId' => $decoded->data->userId, 'role' => $decoded->data->role, 'name' => $userName];
        } catch (ExpiredException $e) {
            sendJsonResponse(['status' => 'error', 'message' => 'Token has expired.'], 401);
        } catch (SignatureInvalidException $e) {
            sendJsonResponse(['status' => 'error', 'message' => 'Token signature invalid.'], 401);
        } catch (BeforeValidException $e) {
            sendJsonResponse(['status' => 'error', 'message' => 'Token not yet valid.'], 401);
        } catch (Exception $e) {
            error_log("JWT Decode Error for client_reviews: " . $e->getMessage());
            sendJsonResponse(['status' => 'error', 'message' => 'Invalid token: ' . $e->getMessage()], 401);
        }
        exit;
    }

    // --- Check if reviews table exists, create if not ---
    function ensureReviewsTableExists(PDO $pdo): void {
        $checkTableStmt = $pdo->prepare("
            SELECT COUNT(*) 
            FROM information_schema.tables 
            WHERE table_schema = DATABASE() 
            AND table_name = 'therapist_reviews'
        ");
        $checkTableStmt->execute();
        $tableExists = (bool)$checkTableStmt->fetchColumn();

        if (!$tableExists) {
            // Create the table if it doesn't exist
            $createTableSql = "
                CREATE TABLE therapist_reviews (
                    id VARCHAR(255) NOT NULL,
                    therapist_id VARCHAR(255) NOT NULL,
                    client_id VARCHAR(255) NOT NULL,
                    client_name VARCHAR(255) NOT NULL,
                    rating DECIMAL(2,1) NOT NULL,
                    comment TEXT,
                    is_verified BOOLEAN DEFAULT FALSE,
                    is_hidden BOOLEAN DEFAULT FALSE,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    PRIMARY KEY (id),
                    KEY therapist_idx (therapist_id),
                    KEY client_idx (client_id),
                    CONSTRAINT fk_reviews_therapist FOREIGN KEY (therapist_id) REFERENCES users (id) ON DELETE CASCADE,
                    CONSTRAINT fk_reviews_client FOREIGN KEY (client_id) REFERENCES users (id) ON DELETE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
            ";
            $pdo->exec($createTableSql);
        }
    }

    // --- Handle GET Request: Fetch client's reviews ---
    if ($method === 'GET') {
        $authData = getAuthenticatedClient($jwtKey);
        $clientUserId = $authData['userId'];

        try {
            ensureReviewsTableExists($pdo);

            $stmt = $pdo->prepare("
                SELECT r.*, u.name as therapist_name, u.profile_picture_url as therapist_profile_picture_url
                FROM therapist_reviews r
                JOIN users u ON r.therapist_id = u.id
                WHERE r.client_id = :client_id
                ORDER BY r.created_at DESC
            ");
            $stmt->bindParam(':client_id', $clientUserId);
            $stmt->execute();
            $reviews = $stmt->fetchAll(PDO::FETCH_ASSOC);

            // Format reviews for frontend
            $formattedReviews = [];
            foreach ($reviews as $review) {
                $formattedReviews[] = [
                    'id' => $review['id'],
                    'therapistId' => $review['therapist_id'],
                    'therapistName' => $review['therapist_name'],
                    'therapistProfilePictureUrl' => $review['therapist_profile_picture_url'],
                    'clientId' => $review['client_id'],
                    'clientName' => $review['client_name'],
                    'rating' => (float)$review['rating'],
                    'comment' => $review['comment'],
                    'isVerified' => (bool)$review['is_verified'],
                    'isHidden' => (bool)$review['is_hidden'],
                    'createdAt' => $review['created_at'],
                    'updatedAt' => $review['updated_at']
                ];
            }

            sendJsonResponse([
                'status' => 'success',
                'reviews' => $formattedReviews
            ], 200);
        } catch (PDOException $e) {
            error_log("Database error fetching client reviews: " . $e->getMessage());
            sendJsonResponse(['status' => 'error', 'message' => 'Failed to fetch reviews.'], 500);
        }
    }

    // --- Handle POST Request: Submit a new review ---
    elseif ($method === 'POST') {
        $authData = getAuthenticatedClient($jwtKey);
        $clientUserId = $authData['userId'];
        $clientName = $authData['name'];

        $input = json_decode(file_get_contents('php://input'), true);

        if (json_last_error() !== JSON_ERROR_NONE) {
            sendJsonResponse(['status' => 'error', 'message' => 'Invalid JSON input.'], 400);
        }

        $therapistId = trim($input['therapistId'] ?? '');
        $rating = isset($input['rating']) ? (float)$input['rating'] : 0;
        $comment = trim($input['comment'] ?? '');

        // Basic validation
        if (empty($therapistId)) {
            sendJsonResponse(['status' => 'error', 'message' => 'Therapist ID is required.'], 400);
        }
        if ($rating < 1 || $rating > 5) {
            sendJsonResponse(['status' => 'error', 'message' => 'Rating must be between 1 and 5.'], 400);
        }

        try {
            ensureReviewsTableExists($pdo);

            // Verify the therapist exists
            $verifyStmt = $pdo->prepare("
                SELECT COUNT(*) FROM users 
                WHERE id = :therapist_id AND role = 'THERAPIST'
            ");
            $verifyStmt->bindParam(':therapist_id', $therapistId);
            $verifyStmt->execute();
            
            if ($verifyStmt->fetchColumn() == 0) {
                sendJsonResponse(['status' => 'error', 'message' => 'Therapist not found.'], 404);
            }

            // Check if client has already reviewed this therapist
            $checkStmt = $pdo->prepare("
                SELECT id FROM therapist_reviews 
                WHERE client_id = :client_id AND therapist_id = :therapist_id
            ");
            $checkStmt->bindParam(':client_id', $clientUserId);
            $checkStmt->bindParam(':therapist_id', $therapistId);
            $checkStmt->execute();
            $existingReview = $checkStmt->fetch(PDO::FETCH_ASSOC);

            $pdo->beginTransaction();

            if ($existingReview) {
                // Update existing review
                $updateStmt = $pdo->prepare("
                    UPDATE therapist_reviews 
                    SET rating = :rating, comment = :comment, updated_at = NOW() 
                    WHERE id = :id
                ");
                $updateStmt->bindParam(':rating', $rating);
                $updateStmt->bindParam(':comment', $comment);
                $updateStmt->bindParam(':id', $existingReview['id']);
                $updateStmt->execute();
                $reviewId = $existingReview['id'];
                $message = 'Review updated successfully.';
            } else {
                // Create new review
                $reviewId = 'rev_' . generateUniqueId();
                $insertStmt = $pdo->prepare("
                    INSERT INTO therapist_reviews (
                        id, therapist_id, client_id, client_name, rating, comment
                    ) VALUES (
                        :id, :therapist_id, :client_id, :client_name, :rating, :comment
                    )
                ");
                $insertStmt->bindParam(':id', $reviewId);
                $insertStmt->bindParam(':therapist_id', $therapistId);
                $insertStmt->bindParam(':client_id', $clientUserId);
                $insertStmt->bindParam(':client_name', $clientName);
                $insertStmt->bindParam(':rating', $rating);
                $insertStmt->bindParam(':comment', $comment);
                $insertStmt->execute();
                $message = 'Review submitted successfully.';
            }

            // Update therapist's average rating and review count
            $updateTherapistStmt = $pdo->prepare("
                UPDATE therapists_data td
                SET 
                    td.rating = (
                        SELECT AVG(tr.rating) 
                        FROM therapist_reviews tr 
                        WHERE tr.therapist_id = :therapist_id AND tr.is_hidden = FALSE
                    ),
                    td.review_count = (
                        SELECT COUNT(*) 
                        FROM therapist_reviews tr 
                        WHERE tr.therapist_id = :therapist_id AND tr.is_hidden = FALSE
                    )
                WHERE td.user_id = :therapist_id
            ");
            $updateTherapistStmt->bindParam(':therapist_id', $therapistId);
            $updateTherapistStmt->execute();

            // Log the review submission in activity_logs
            $logId = 'alog_' . generateUniqueId();
            $logStmt = $pdo->prepare("
                INSERT INTO activity_logs (
                    id, timestamp, user_id, user_name, user_role, action, 
                    target_id, target_type, details
                ) VALUES (
                    :id, NOW(), :user_id, :user_name, 'CLIENT', :action, 
                    :target_id, 'therapist', :details
                )
            ");
            $action = $existingReview ? 'UPDATED_REVIEW' : 'SUBMITTED_REVIEW';
            $logStmt->bindParam(':id', $logId);
            $logStmt->bindParam(':user_id', $clientUserId);
            $logStmt->bindParam(':user_name', $clientName);
            $logStmt->bindParam(':action', $action);
            $logStmt->bindParam(':target_id', $therapistId);
            $logStmt->bindParam(':details', json_encode(['reviewId' => $reviewId, 'rating' => $rating]));
            $logStmt->execute();

            $pdo->commit();

            // Fetch the updated review to return
            $fetchStmt = $pdo->prepare("
                SELECT r.*, u.name as therapist_name, u.profile_picture_url as therapist_profile_picture_url
                FROM therapist_reviews r
                JOIN users u ON r.therapist_id = u.id
                WHERE r.id = :review_id
            ");
            $fetchStmt->bindParam(':review_id', $reviewId);
            $fetchStmt->execute();
            $review = $fetchStmt->fetch(PDO::FETCH_ASSOC);

            // Format review for frontend
            $formattedReview = [
                'id' => $review['id'],
                'therapistId' => $review['therapist_id'],
                'therapistName' => $review['therapist_name'],
                'therapistProfilePictureUrl' => $review['therapist_profile_picture_url'],
                'clientId' => $review['client_id'],
                'clientName' => $review['client_name'],
                'rating' => (float)$review['rating'],
                'comment' => $review['comment'],
                'isVerified' => (bool)$review['is_verified'],
                'isHidden' => (bool)$review['is_hidden'],
                'createdAt' => $review['created_at'],
                'updatedAt' => $review['updated_at']
            ];

            sendJsonResponse([
                'status' => 'success',
                'message' => $message,
                'review' => $formattedReview
            ], $existingReview ? 200 : 201);
        } catch (PDOException $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            error_log("Database error submitting review: " . $e->getMessage());
            sendJsonResponse(['status' => 'error', 'message' => 'A server error occurred while submitting your review.'], 500);
        }
    }

    // --- Handle DELETE Request: Delete a review ---
    elseif ($method === 'DELETE') {
        $authData = getAuthenticatedClient($jwtKey);
        $clientUserId = $authData['userId'];

        $input = json_decode(file_get_contents('php://input'), true);

        if (json_last_error() !== JSON_ERROR_NONE || !isset($input['reviewId'])) {
            sendJsonResponse(['status' => 'error', 'message' => 'Invalid JSON input or missing review ID.'], 400);
        }

        $reviewId = trim($input['reviewId']);

        try {
            ensureReviewsTableExists($pdo);

            // Verify the review exists and belongs to this client
            $verifyStmt = $pdo->prepare("
                SELECT r.*, u.name as therapist_name
                FROM therapist_reviews r
                JOIN users u ON r.therapist_id = u.id
                WHERE r.id = :review_id AND r.client_id = :client_id
            ");
            $verifyStmt->bindParam(':review_id', $reviewId);
            $verifyStmt->bindParam(':client_id', $clientUserId);
            $verifyStmt->execute();
            $review = $verifyStmt->fetch(PDO::FETCH_ASSOC);
            
            if (!$review) {
                sendJsonResponse(['status' => 'error', 'message' => 'Review not found or you are not authorized to delete it.'], 404);
            }

            $therapistId = $review['therapist_id'];
            $therapistName = $review['therapist_name'];

            $pdo->beginTransaction();

            // Delete the review
            $deleteStmt = $pdo->prepare("
                DELETE FROM therapist_reviews 
                WHERE id = :review_id AND client_id = :client_id
            ");
            $deleteStmt->bindParam(':review_id', $reviewId);
            $deleteStmt->bindParam(':client_id', $clientUserId);
            $deleteStmt->execute();

            // Update therapist's average rating and review count
            $updateTherapistStmt = $pdo->prepare("
                UPDATE therapists_data td
                SET 
                    td.rating = (
                        SELECT AVG(tr.rating) 
                        FROM therapist_reviews tr 
                        WHERE tr.therapist_id = :therapist_id AND tr.is_hidden = FALSE
                    ),
                    td.review_count = (
                        SELECT COUNT(*) 
                        FROM therapist_reviews tr 
                        WHERE tr.therapist_id = :therapist_id AND tr.is_hidden = FALSE
                    )
                WHERE td.user_id = :therapist_id
            ");
            $updateTherapistStmt->bindParam(':therapist_id', $therapistId);
            $updateTherapistStmt->execute();

            // Log the review deletion in activity_logs
            $logId = 'alog_' . generateUniqueId();
            $logStmt = $pdo->prepare("
                INSERT INTO activity_logs (
                    id, timestamp, user_id, user_name, user_role, action, 
                    target_id, target_type, details
                ) VALUES (
                    :id, NOW(), :user_id, :user_name, 'CLIENT', 'DELETED_REVIEW', 
                    :target_id, 'therapist', :details
                )
            ");
            $logStmt->bindParam(':id', $logId);
            $logStmt->bindParam(':user_id', $clientUserId);
            $logStmt->bindParam(':user_name', $authData['name']);
            $logStmt->bindParam(':target_id', $therapistId);
            $logStmt->bindParam(':details', json_encode([
                'reviewId' => $reviewId,
                'therapistName' => $therapistName
            ]));
            $logStmt->execute();

            $pdo->commit();

            sendJsonResponse([
                'status' => 'success',
                'message' => 'Review deleted successfully.'
            ], 200);
        } catch (PDOException $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            error_log("Database error deleting review: " . $e->getMessage());
            sendJsonResponse(['status' => 'error', 'message' => 'A server error occurred while deleting your review.'], 500);
        }
    }

    // --- Invalid Method ---
    else {
        sendJsonResponse(['status' => 'error', 'message' => 'Invalid request method for client reviews.'], 405);
    }
} catch (Throwable $e) {
    // Log the error and send a clean JSON response
    error_log("Unhandled error in client_reviews.php: " . $e->getMessage());
    error_log("Stack trace: " . $e->getTraceAsString());
    sendJsonResponse(['status' => 'error', 'message' => 'An unexpected error occurred.'], 500);
}
?>