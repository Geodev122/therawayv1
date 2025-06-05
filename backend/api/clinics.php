<?php
// backend/api/clinics.php

declare(strict_types=1);
ini_set('display_errors', '0'); // Log errors, don't display in API output
error_reporting(E_ALL);

try { // Global try-catch block to handle any unhandled errors
    // --- Includes ---
    require_once __DIR__ . '/../config/core.php';
    require_once __DIR__ . '/../config/db.php'; // Provides $pdo
    require_once __DIR__ . '/../vendor/autoload.php'; // Composer autoloader (for JWT if ever needed here)

    // --- CORS Handling ---
    handleCors(); // From core.php

    // --- Request Method Check ---
    $method = strtoupper($_SERVER['REQUEST_METHOD']);

    // --- Handle GET Request: Fetch list of live clinics ---
    if ($method === 'GET') {
        // Pagination parameters
        $page = isset($_GET['page']) ? max(1, (int)$_GET['page']) : 1;
        $limit = isset($_GET['limit']) ? max(1, min(100, (int)$_GET['limit'])) : 20; // Max 100 per page
        $offset = ($page - 1) * $limit;

        // Optional search term (e.g., search by clinic name or address)
        $searchTerm = isset($_GET['searchTerm']) ? trim($_GET['searchTerm']) : null;

        $whereClauses = ["cd.account_status = 'live'"]; // Only fetch 'live' clinics
        $params = [];

        if ($searchTerm) {
            $whereClauses[] = "(cd.clinic_name LIKE :searchTerm OR cd.address LIKE :searchTerm)";
            $params[':searchTerm'] = "%{$searchTerm}%";
        }
        
        $sqlWhere = count($whereClauses) > 0 ? " WHERE " . implode(" AND ", $whereClauses) : "";
        $sqlOrder = " ORDER BY cd.clinic_name ASC"; // Order by clinic name

        try {
            // Count total items for pagination
            $countSql = "SELECT COUNT(cd.clinic_id) FROM clinics_data cd" . $sqlWhere;
            $countStmt = $pdo->prepare($countSql);
            $countStmt->execute($params);
            $totalItems = (int)$countStmt->fetchColumn();
            $totalPages = ceil($totalItems / $limit);

            // Fetch clinics for the current page
            // Select only summary fields necessary for a general listing
            $mainSql = "
                SELECT 
                    cd.clinic_id as id, 
                    cd.clinic_name as name, 
                    cd.address, 
                    cd.clinic_profile_picture_url as profilePictureUrl,
                    cd.description, -- Maybe a short description or tagline
                    u.name as ownerName -- Optional: if you want to show owner's name
                FROM clinics_data cd
                LEFT JOIN users u ON cd.user_id = u.id -- Join to get owner name if needed
                " . $sqlWhere . $sqlOrder . " LIMIT :limit OFFSET :offset";
            
            $stmt = $pdo->prepare($mainSql);
            // Bind named parameters for main query
            foreach ($params as $key => $value) {
                $stmt->bindValue($key, $value);
            }
            $stmt->bindParam(':limit', $limit, PDO::PARAM_INT);
            $stmt->bindParam(':offset', $offset, PDO::PARAM_INT);
            $stmt->execute();
            $clinics = $stmt->fetchAll(PDO::FETCH_ASSOC);

            // Basic transformation if needed (e.g., ensuring profilePictureUrl is a full URL if stored relatively)
            foreach ($clinics as &$clinic) {
                // Example: if profilePictureUrl is stored relatively and needs base URL
                // if ($clinic['profilePictureUrl'] && !filter_var($clinic['profilePictureUrl'], FILTER_VALIDATE_URL)) {
                //    $clinic['profilePictureUrl'] = (defined('BASE_UPLOAD_URL_PUBLIC') ? BASE_UPLOAD_URL_PUBLIC : '/backend/uploads') . $clinic['profilePictureUrl'];
                // }
            }
            unset($clinic);


            sendJsonResponse([
                'status' => 'success',
                'clinics' => $clinics,
                'pagination' => [
                    'currentPage' => $page,
                    'totalPages' => $totalPages,
                    'totalItems' => $totalItems,
                    'itemsPerPage' => $limit
                ]
            ], 200);

        } catch (PDOException $e) {
            error_log("Database error fetching clinics: " . $e->getMessage());
            sendJsonResponse(['status' => 'error', 'message' => 'Failed to fetch clinic data.'], 500);
        }
    }

    // --- Invalid Method ---
    else {
        sendJsonResponse(['status' => 'error', 'message' => 'Invalid request method. Only GET is accepted for this endpoint.'], 405);
    }
} catch (Throwable $e) {
    // Log the error and send a clean JSON response
    error_log("Unhandled error in clinics.php: " . $e->getMessage());
    error_log("Stack trace: " . $e->getTraceAsString());
    sendJsonResponse(['status' => 'error', 'message' => 'An unexpected error occurred.'], 500);
}
?>