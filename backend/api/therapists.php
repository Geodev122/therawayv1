<?php
// backend/api/therapists.php

declare(strict_types=1);
ini_set('display_errors', '0'); // Log errors, don't display in API output
error_reporting(E_ALL);

try { // Global try-catch block to handle any unhandled errors
    // --- Includes ---
    require_once __DIR__ . '/../config/core.php';
    require_once __DIR__ . '/../config/db.php'; // Provides $pdo
    require_once __DIR__ . '/../vendor/autoload.php'; // Composer autoloader

    // --- CORS Handling ---
    handleCors(); // From core.php

    // --- Request Method Check ---
    $method = strtoupper($_SERVER['REQUEST_METHOD']);

    // --- Handle GET Request: Fetch list of therapists ---
    if ($method === 'GET') {
        // Pagination parameters
        $page = isset($_GET['page']) ? max(1, (int)$_GET['page']) : 1;
        $limit = isset($_GET['limit']) ? max(1, min(100, (int)$_GET['limit'])) : 20; // Max 100 per page
        $offset = ($page - 1) * $limit;

        // Filter parameters
        $searchTerm = isset($_GET['searchTerm']) ? trim($_GET['searchTerm']) : null;
        $specializations = isset($_GET['specializations']) ? explode(',', trim($_GET['specializations'])) : [];
        $languages = isset($_GET['languages']) ? explode(',', trim($_GET['languages'])) : [];
        $minRating = isset($_GET['minRating']) ? (float)$_GET['minRating'] : 0;
        $availability = isset($_GET['availability']) ? explode(',', trim($_GET['availability'])) : [];
        $locationSearch = isset($_GET['locationSearch']) ? trim($_GET['locationSearch']) : null;

        // Base WHERE clause - only show 'live' therapists
        $whereClauses = ["td.account_status = 'live'"];
        $params = [];

        // Add filters to WHERE clause
        if ($searchTerm) {
            $whereClauses[] = "(u.name LIKE :searchTerm)";
            $params[':searchTerm'] = "%{$searchTerm}%";
        }

        if (!empty($specializations)) {
            $specializationClauses = [];
            foreach ($specializations as $index => $spec) {
                $key = ":spec{$index}";
                $specializationClauses[] = "JSON_CONTAINS(td.specializations, JSON_QUOTE({$key}))";
                $params[$key] = trim($spec);
            }
            $whereClauses[] = "(" . implode(" OR ", $specializationClauses) . ")";
        }

        if (!empty($languages)) {
            $languageClauses = [];
            foreach ($languages as $index => $lang) {
                $key = ":lang{$index}";
                $languageClauses[] = "JSON_CONTAINS(td.languages, JSON_QUOTE({$key}))";
                $params[$key] = trim($lang);
            }
            $whereClauses[] = "(" . implode(" OR ", $languageClauses) . ")";
        }

        if ($minRating > 0) {
            $whereClauses[] = "td.rating >= :minRating";
            $params[':minRating'] = $minRating;
        }

        if (!empty($availability)) {
            $availabilityClauses = [];
            foreach ($availability as $index => $avail) {
                $key = ":avail{$index}";
                $availabilityClauses[] = "JSON_CONTAINS(td.availability, JSON_QUOTE({$key}))";
                $params[$key] = trim($avail);
            }
            $whereClauses[] = "(" . implode(" OR ", $availabilityClauses) . ")";
        }

        if ($locationSearch) {
            $whereClauses[] = "JSON_SEARCH(td.locations, 'one', :locationSearch, NULL, '$.address') IS NOT NULL";
            $params[':locationSearch'] = "%{$locationSearch}%";
        }

        $sqlWhere = count($whereClauses) > 0 ? " WHERE " . implode(" AND ", $whereClauses) : "";
        $sqlOrder = " ORDER BY td.rating DESC, td.review_count DESC"; // Order by rating and review count

        try {
            // Count total items for pagination
            $countSql = "SELECT COUNT(u.id) FROM users u JOIN therapists_data td ON u.id = td.user_id" . $sqlWhere;
            $countStmt = $pdo->prepare($countSql);
            $countStmt->execute($params);
            $totalItems = (int)$countStmt->fetchColumn();
            $totalPages = ceil($totalItems / $limit);

            // Fetch therapists for the current page
            $mainSql = "
                SELECT 
                    u.id, u.name, u.profile_picture_url,
                    td.bio, td.whatsapp_number, td.intro_video_url,
                    td.specializations, td.languages, td.qualifications, td.locations,
                    td.rating, td.review_count, td.is_overall_verified, td.availability
                FROM users u
                JOIN therapists_data td ON u.id = td.user_id
                " . $sqlWhere . $sqlOrder . " LIMIT :limit OFFSET :offset";
            
            $stmt = $pdo->prepare($mainSql);
            // Bind named parameters for main query
            foreach ($params as $key => $value) {
                $stmt->bindValue($key, $value);
            }
            $stmt->bindParam(':limit', $limit, PDO::PARAM_INT);
            $stmt->bindParam(':offset', $offset, PDO::PARAM_INT);
            $stmt->execute();
            $therapistsRaw = $stmt->fetchAll(PDO::FETCH_ASSOC);

            // Process therapists data for frontend
            $therapists = [];
            foreach ($therapistsRaw as $therapist) {
                // Decode JSON fields
                $jsonFields = ['specializations', 'languages', 'qualifications', 'locations', 'availability'];
                foreach ($jsonFields as $field) {
                    if (isset($therapist[$field]) && $therapist[$field] !== null) {
                        $decoded = json_decode($therapist[$field], true);
                        $therapist[$field] = is_array($decoded) ? $decoded : [];
                    } else {
                        $therapist[$field] = [];
                    }
                }

                // Rename fields to match frontend expectations
                $therapist['isVerified'] = (bool)($therapist['is_overall_verified'] ?? false);
                unset($therapist['is_overall_verified']);

                // Add to results
                $therapists[] = $therapist;
            }

            sendJsonResponse([
                'status' => 'success',
                'therapists' => $therapists,
                'pagination' => [
                    'currentPage' => $page,
                    'totalPages' => $totalPages,
                    'totalItems' => $totalItems,
                    'itemsPerPage' => $limit
                ]
            ], 200);

        } catch (PDOException $e) {
            error_log("Database error fetching therapists: " . $e->getMessage());
            sendJsonResponse(['status' => 'error', 'message' => 'Failed to fetch therapist data.'], 500);
        }
    }

    // --- Invalid Method ---
    else {
        sendJsonResponse(['status' => 'error', 'message' => 'Invalid request method. Only GET is accepted for this endpoint.'], 405);
    }
} catch (Throwable $e) {
    // Log the error and send a clean JSON response
    error_log("Unhandled error in therapists.php: " . $e->getMessage());
    error_log("Stack trace: " . $e->getTraceAsString());
    sendJsonResponse(['status' => 'error', 'message' => 'An unexpected error occurred.'], 500);
}
?>