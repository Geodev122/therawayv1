<?php
declare(strict_types=1);
ini_set('display_errors', '0');
error_reporting(E_ALL);

require_once __DIR__ . '/../config/core.php';
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../vendor/autoload.php';

handleCors();

$method = strtoupper($_SERVER['REQUEST_METHOD']);

// Get authenticated user (from core/helpers.php)
$user = getAuthenticatedUser();
if (!$user || $user['role'] !== 'CLIENT') {
    sendJsonResponse(['status' => 'error', 'message' => 'Unauthorized. Client access only.'], 401);
}

if ($method === 'GET') {
    // Fetch client's favorite therapists
    try {
        $stmt = $pdo->prepare("
            SELECT therapist_id 
            FROM client_therapist_favorites 
            WHERE client_id = :client_id
        ");
        $stmt->bindParam(':client_id', $user['id']);
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
    
} elseif ($method === 'POST') {
    // Toggle favorite status for a therapist
    $input = json_decode(file_get_contents('php://input'), true);
    
    if (!isset($input['therapistId']) || empty($input['therapistId'])) {
        sendJsonResponse([
            'status' => 'error',
            'message' => 'Therapist ID is required.'
        ], 400);
    }
    
    $therapistId = trim($input['therapistId']);
    
    try {
        // Check if favorite already exists
        $stmt = $pdo->prepare("
            SELECT COUNT(*) 
            FROM client_therapist_favorites 
            WHERE client_id = :client_id AND therapist_id = :therapist_id
        ");
        $stmt->bindParam(':client_id', $user['id']);
        $stmt->bindParam(':therapist_id', $therapistId);
        $stmt->execute();
        
        $exists = (bool)$stmt->fetchColumn();
        
        if ($exists) {
            // Remove favorite
            $stmt = $pdo->prepare("
                DELETE FROM client_therapist_favorites 
                WHERE client_id = :client_id AND therapist_id = :therapist_id
            ");
        } else {
            // Add favorite
            $stmt = $pdo->prepare("
                INSERT INTO client_therapist_favorites (client_id, therapist_id, created_at) 
                VALUES (:client_id, :therapist_id, NOW())
            ");
        }
        
        $stmt->bindParam(':client_id', $user['id']);
        $stmt->bindParam(':therapist_id', $therapistId);
        $stmt->execute();
        
        sendJsonResponse([
            'status' => 'success',
            'message' => $exists ? 'Favorite removed.' : 'Favorite added.',
            'isFavorite' => !$exists
        ]);
        
    } catch (PDOException $e) {
        error_log("Database error toggling favorite: " . $e->getMessage());
        sendJsonResponse([
            'status' => 'error',
            'message' => 'Failed to update favorite status.'
        ], 500);
    }
    
} else {
    sendJsonResponse([
        'status' => 'error',
        'message' => 'Method not allowed.'
    ], 405);
}
?>