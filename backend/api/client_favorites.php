<?php
// backend/api/client_favorites.php

declare(strict_types=1);
ini_set('display_errors', '0'); // Log errors, don't display in API output
error_reporting(E_ALL);

// --- Includes ---
try {
    require_once __DIR__ . '/../config/core.php';
    require_once __DIR__ . '/../config/db.php'; // Provides $pdo
    require_once __DIR__ . '/../vendor/autoload.php'; // Composer autoloader

    // --- CORS Handling ---
    handleCors(); // From core.php

    // --- Request Method & JWT Key ---
    $method = strtoupper($_SERVER['REQUEST_METHOD']);
    $jwtKey = defined('JWT_SECRET_KEY') ? JWT_SECRET_KEY : null;

    if (!$jwtKey) {
        error_log("JWT_SECRET_KEY is not defined in core.php for client_favorites.php");
        sendJsonResponse(['status' => 'error', 'message' => 'Server configuration error (JWT).'], 500);
    }

    // --- Authentication Check ---
    try {
        $authData = getAuthenticatedUser($jwtKey, ['CLIENT']);
        $clientUserId = $authData['userId'];
    } catch (Exception $e) {
        error_log("Authentication error in client_favorites.php: " . $e->getMessage());
        sendJsonResponse(['status' => 'error', 'message' => 'Authentication failed: ' . $e->getMessage()], 401);
    }

    // --- Process GET Request: Fetch client's favorite therapists ---
    if ($method === 'GET') {
        try {
            $stmt = $pdo->prepare("
                SELECT therapist_user_id 
                FROM client_therapist_favorites 
                WHERE client_user_id = :client_id
            ");
            $stmt->bindParam(':client_id', $clientUserId);
            $stmt->execute();
            
            $favorites = $stmt->fetchAll(PDO::FETCH_COLUMN);
            
            sendJsonResponse([
                'status' => 'success',
                'data' => $favorites
            ]);
            
        } catch (PDOException $e) {
            error_log("Database error fetching favorites: " . $e->getMessage());
            sendJsonResponse([
                'status' => 'error',
                'message' => 'Failed to fetch favorites.'
            ], 500);
        }
    }
    // --- Process POST Request: Toggle favorite status for a therapist ---
    elseif ($method === 'POST') {
        try {
            $input = json_decode(file_get_contents('php://input'), true);
            
            if (json_last_error() !== JSON_ERROR_NONE) {
                sendJsonResponse(['status' => 'error', 'message' => 'Invalid JSON input.'], 400);
            }
            
            if (!isset($input['therapistId']) || empty($input['therapistId'])) {
                sendJsonResponse(['status' => 'error', 'message' => 'Therapist ID is required.'], 400);
            }
            
            $therapistId = trim($input['therapistId']);
            
            // Verify therapist exists
            $verifyStmt = $pdo->prepare("
                SELECT COUNT(*) FROM users 
                WHERE id = :therapist_id AND role = 'THERAPIST'
            ");
            $verifyStmt->bindParam(':therapist_id', $therapistId);
            $verifyStmt->execute();
            
            if ($verifyStmt->fetchColumn() == 0) {
                sendJsonResponse(['status' => 'error', 'message' => 'Therapist not found.'], 404);
            }
            
            // Check if favorite already exists
            $checkStmt = $pdo->prepare("
                SELECT COUNT(*) 
                FROM client_therapist_favorites 
                WHERE client_user_id = :client_id AND therapist_user_id = :therapist_id
            ");
            $checkStmt->bindParam(':client_id', $clientUserId);
            $checkStmt->bindParam(':therapist_id', $therapistId);
            $checkStmt->execute();
            
            $exists = (bool)$checkStmt->fetchColumn();
            
            $pdo->beginTransaction();
            
            if ($exists) {
                // Remove favorite
                $actionStmt = $pdo->prepare("
                    DELETE FROM client_therapist_favorites 
                    WHERE client_user_id = :client_id AND therapist_user_id = :therapist_id
                ");
                $action = 'removed';
            } else {
                // Add favorite
                $actionStmt = $pdo->prepare("
                    INSERT INTO client_therapist_favorites (client_user_id, therapist_user_id, created_at) 
                    VALUES (:client_id, :therapist_id, NOW())
                ");
                $action = 'added';
            }
            
            $actionStmt->bindParam(':client_id', $clientUserId);
            $actionStmt->bindParam(':therapist_id', $therapistId);
            $actionStmt->execute();
            
            // Get updated list of favorites
            $listStmt = $pdo->prepare("
                SELECT therapist_user_id 
                FROM client_therapist_favorites 
                WHERE client_user_id = :client_id
            ");
            $listStmt->bindParam(':client_id', $clientUserId);
            $listStmt->execute();
            $updatedFavorites = $listStmt->fetchAll(PDO::FETCH_COLUMN);
            
            $pdo->commit();
            
            sendJsonResponse([
                'status' => 'success',
                'message' => 'Favorite ' . $action . ' successfully.',
                'action' => $action,
                'data' => $updatedFavorites
            ]);
            
        } catch (PDOException $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            error_log("Database error toggling favorite: " . $e->getMessage());
            sendJsonResponse([
                'status' => 'error',
                'message' => 'Failed to update favorite status.'
            ], 500);
        } catch (Exception $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            error_log("Error toggling favorite: " . $e->getMessage());
            sendJsonResponse([
                'status' => 'error',
                'message' => 'An error occurred while updating favorite status.'
            ], 500);
        }
    }
    // --- Invalid Method ---
    else {
        sendJsonResponse([
            'status' => 'error',
            'message' => 'Method not allowed. Only GET and POST are accepted for this endpoint.'
        ], 405);
    }
} catch (Throwable $e) {
    // Global error handler to ensure we always return a valid JSON response
    error_log("Unexpected error in client_favorites.php: " . $e->getMessage());
    sendJsonResponse([
        'status' => 'error',
        'message' => 'An unexpected error occurred. Please try again later.'
    ], 500);
}
?>
