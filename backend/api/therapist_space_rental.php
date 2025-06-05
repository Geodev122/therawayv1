<?php
// backend/api/therapist_space_rental.php

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

    if (!$jwtKey && in_array($method, ['POST', 'PUT', 'DELETE'])) {
        error_log("JWT_SECRET_KEY is not defined in core.php for therapist_space_rental.php (Authenticated Action)");
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
            error_log("JWT Decode Error for therapist_space_rental: " . $e->getMessage());
            sendJsonResponse(['status' => 'error', 'message' => 'Invalid token: ' . $e->getMessage()], 401);
        }
        exit;
    }

    // --- Handle GET Request: Fetch available clinic spaces for therapists ---
    if ($method === 'GET') {
        // This endpoint can be accessed by authenticated therapists or publicly
        $isAuthenticated = false;
        $userId = null;
        
        if (isset($_SERVER['HTTP_AUTHORIZATION']) && $jwtKey) {
            try {
                $authData = getAuthenticatedUser($jwtKey, ['THERAPIST', 'ADMIN']);
                $isAuthenticated = true;
                $userId = $authData['userId'];
            } catch (Exception $e) {
                // If authentication fails but endpoint is public, continue without auth
                error_log("Optional authentication failed in therapist_space_rental.php: " . $e->getMessage());
            }
        }

        // Pagination parameters
        $page = isset($_GET['page']) ? max(1, (int)$_GET['page']) : 1;
        $limit = isset($_GET['limit']) ? max(1, min(50, (int)$_GET['limit'])) : 10; // Max 50 per page
        $offset = ($page - 1) * $limit;

        // Filter parameters
        $locationFilter = isset($_GET['location']) ? trim($_GET['location']) : null;
        $minPriceFilter = isset($_GET['minPrice']) ? (float)$_GET['minPrice'] : null;
        $maxPriceFilter = isset($_GET['maxPrice']) ? (float)$_GET['maxPrice'] : null;
        $featuresFilter = isset($_GET['features']) ? explode(',', trim($_GET['features'])) : [];
        $featuresFilter = array_map('trim', array_filter($featuresFilter));

        // Base WHERE clause - only show spaces from 'live' clinics
        $whereClauses = ["cd.account_status = 'live'"];
        $params = [];

        // Add filters to WHERE clause
        if ($locationFilter) {
            $whereClauses[] = "(cs.name LIKE :location OR cs.description LIKE :location OR cd.address LIKE :location)";
            $params[':location'] = "%{$locationFilter}%";
        }
        if ($minPriceFilter !== null) {
            $whereClauses[] = "cs.rental_price >= :minPrice";
            $params[':minPrice'] = $minPriceFilter;
        }
        if ($maxPriceFilter !== null) {
            $whereClauses[] = "cs.rental_price <= :maxPrice";
            $params[':maxPrice'] = $maxPriceFilter;
        }
        
        // Handle features filter - this is more complex with JSON
        foreach ($featuresFilter as $index => $feature) {
            if (!empty($feature)) {
                $key = ":feature{$index}";
                // This is a simplified approach - actual implementation depends on your MySQL/MariaDB version
                $whereClauses[] = "JSON_CONTAINS(cs.features, JSON_QUOTE(:feature{$index}))";
                $params[$key] = $feature;
            }
        }

        $sqlWhere = count($whereClauses) > 0 ? " WHERE " . implode(" AND ", $whereClauses) : "";
        $sqlOrder = " ORDER BY cs.created_at DESC"; // Newest first

        try {
            // Count total items for pagination
            $countSql = "SELECT COUNT(cs.id) FROM clinic_spaces cs JOIN clinics_data cd ON cs.clinic_id = cd.clinic_id" . $sqlWhere;
            $countStmt = $pdo->prepare($countSql);
            $countStmt->execute($params);
            $totalItems = (int)$countStmt->fetchColumn();
            $totalPages = ceil($totalItems / $limit);

            // Fetch spaces for the current page
            $mainSql = "
                SELECT 
                    cs.id, cs.name, cs.description, cs.photos, cs.rental_price as rentalPrice, 
                    cs.rental_duration as rentalDuration, cs.rental_terms as rentalTerms, cs.features,
                    cd.clinic_id as clinicId, cd.clinic_name as clinicName, cd.address as clinicAddress,
                    cd.whatsapp_number as clinicWhatsappNumber
                FROM clinic_spaces cs
                JOIN clinics_data cd ON cs.clinic_id = cd.clinic_id
                " . $sqlWhere . $sqlOrder . " LIMIT :limit OFFSET :offset";
            
            $stmt = $pdo->prepare($mainSql);
            foreach ($params as $key => $value) {
                $stmt->bindValue($key, $value);
            }
            $stmt->bindParam(':limit', $limit, PDO::PARAM_INT);
            $stmt->bindParam(':offset', $offset, PDO::PARAM_INT);
            $stmt->execute();
            $spaces = $stmt->fetchAll(PDO::FETCH_ASSOC);

            // Process spaces data for frontend
            foreach ($spaces as &$space) {
                // Decode JSON fields
                if (isset($space['photos']) && $space['photos'] !== null) {
                    $space['photos'] = json_decode($space['photos'], true) ?: [];
                } else {
                    $space['photos'] = [];
                }
                
                if (isset($space['features']) && $space['features'] !== null) {
                    $space['features'] = json_decode($space['features'], true) ?: [];
                } else {
                    $space['features'] = [];
                }
            }
            unset($space); // Unset reference

            sendJsonResponse([
                'status' => 'success',
                'spaces' => $spaces,
                'pagination' => [
                    'currentPage' => $page,
                    'totalPages' => $totalPages,
                    'totalItems' => $totalItems,
                    'itemsPerPage' => $limit
                ]
            ], 200);

        } catch (PDOException $e) {
            error_log("Database error fetching clinic spaces for therapists: " . $e->getMessage());
            sendJsonResponse(['status' => 'error', 'message' => 'Failed to fetch clinic spaces.'], 500);
        }
    }

    // --- Handle POST Request: Express interest in a space (future feature) ---
    elseif ($method === 'POST') {
        $authData = getAuthenticatedUser($jwtKey, ['THERAPIST']); // Only therapists can express interest
        $therapistUserId = $authData['userId'];

        $input = json_decode(file_get_contents('php://input'), true);
        if (json_last_error() !== JSON_ERROR_NONE) {
            sendJsonResponse(['status' => 'error', 'message' => 'Invalid JSON input.'], 400);
        }

        $spaceId = trim($input['spaceId'] ?? '');
        $message = trim($input['message'] ?? '');

        if (empty($spaceId)) {
            sendJsonResponse(['status' => 'error', 'message' => 'Space ID is required.'], 400);
        }

        try {
            // Verify the space exists and get clinic info
            $stmtCheckSpace = $pdo->prepare("
                SELECT cs.clinic_id, cd.user_id as clinic_owner_id, cd.clinic_name
                FROM clinic_spaces cs
                JOIN clinics_data cd ON cs.clinic_id = cd.clinic_id
                WHERE cs.id = :space_id AND cd.account_status = 'live'
            ");
            $stmtCheckSpace->bindParam(':space_id', $spaceId);
            $stmtCheckSpace->execute();
            $spaceData = $stmtCheckSpace->fetch(PDO::FETCH_ASSOC);

            if (!$spaceData) {
                sendJsonResponse(['status' => 'error', 'message' => 'Space not found or not available.'], 404);
            }

            // Get therapist info
            $stmtTherapist = $pdo->prepare("SELECT name FROM users WHERE id = :user_id AND role = 'THERAPIST'");
            $stmtTherapist->bindParam(':user_id', $therapistUserId);
            $stmtTherapist->execute();
            $therapistData = $stmtTherapist->fetch(PDO::FETCH_ASSOC);

            if (!$therapistData) {
                sendJsonResponse(['status' => 'error', 'message' => 'Therapist profile not found.'], 404);
            }

            // For now, just log the interest in activity_logs
            $logId = 'alog_' . generateUniqueId();
            $action = "SPACE_RENTAL_INTEREST";
            $details = json_encode([
                'spaceId' => $spaceId,
                'clinicId' => $spaceData['clinic_id'],
                'clinicName' => $spaceData['clinic_name'],
                'clinicOwnerId' => $spaceData['clinic_owner_id'],
                'message' => $message
            ]);

            $logStmt = $pdo->prepare("
                INSERT INTO activity_logs (id, timestamp, user_id, user_name, user_role, action, target_id, target_type, details)
                VALUES (:id, NOW(), :user_id, :user_name, 'THERAPIST', :action, :target_id, 'clinic_space', :details)
            ");
            $logStmt->bindParam(':id', $logId);
            $logStmt->bindParam(':user_id', $therapistUserId);
            $logStmt->bindParam(':user_name', $therapistData['name']);
            $logStmt->bindParam(':action', $action);
            $logStmt->bindParam(':target_id', $spaceId);
            $logStmt->bindParam(':details', $details);

            if ($logStmt->execute()) {
                sendJsonResponse([
                    'status' => 'success',
                    'message' => 'Interest in space recorded successfully. The clinic owner will be notified.',
                    'interestId' => $logId
                ], 201);
            } else {
                error_log("Failed to record space rental interest for therapist ID: " . $therapistUserId);
                sendJsonResponse(['status' => 'error', 'message' => 'Failed to record interest in space.'], 500);
            }

        } catch (PDOException $e) {
            error_log("Database error recording space rental interest: " . $e->getMessage());
            sendJsonResponse(['status' => 'error', 'message' => 'A server error occurred while recording your interest.'], 500);
        }
    }

    // --- Invalid Method ---
    else {
        sendJsonResponse(['status' => 'error', 'message' => 'Invalid request method for therapist space rental.'], 405);
    }
} catch (Throwable $e) {
    // Log the error and send a clean JSON response
    error_log("Unhandled error in therapist_space_rental.php: " . $e->getMessage());
    error_log("Stack trace: " . $e->getTraceAsString());
    sendJsonResponse(['status' => 'error', 'message' => 'An unexpected error occurred.'], 500);
}
?>