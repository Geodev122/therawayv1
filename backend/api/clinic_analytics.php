<?php
// backend/api/clinic_analytics.php

declare(strict_types=1);
ini_set('display_errors', '0'); // Log errors, don't display in API output
error_reporting(E_ALL);

// --- Includes ---
require_once __DIR__ . '/../config/core.php'; // This now includes helpers.php
require_once __DIR__ . '/../config/db.php';   // Provides $pdo
require_once __DIR__ . '/../vendor/autoload.php'; // Composer autoloader

use Firebase\JWT\JWT; // Still needed if getAuthenticatedUser isn't fully handling all JWT aspects.
use Firebase\JWT\Key;

// --- CORS Handling ---
handleCors(); // From helpers.php (via core.php)

// --- Request Method & JWT Key ---
$method = strtoupper($_SERVER['REQUEST_METHOD']);
$jwtKey = defined('JWT_SECRET_KEY') ? JWT_SECRET_KEY : null; // Used by getAuthenticatedUser

// --- Handle GET Request: Fetch clinic analytics ---
if ($method === 'GET') {
    if (!$jwtKey) { // Should be caught by getAuthenticatedUser, but good check
        sendJsonResponse(['status' => 'error', 'message' => 'Server JWT configuration missing.'], 500);
    }
    // Authenticate Clinic Owner or Admin
    $authData = getAuthenticatedUser($jwtKey, ['CLINIC_OWNER', 'ADMIN']);
    $loggedInUserId = $authData['userId'];
    $loggedInUserRole = $authData['role'];

    $clinicIdToFetch = $_GET['clinicId'] ?? null;

    if (empty($clinicIdToFetch)) {
        sendJsonResponse(['status' => 'error', 'message' => 'Clinic ID is required to fetch analytics.'], 400);
    }

    try {
        // --- Authorization Check ---
        $stmtCheckClinic = $pdo->prepare("SELECT user_id, clinic_name FROM clinics_data WHERE clinic_id = :clinic_id");
        $stmtCheckClinic->bindParam(':clinic_id', $clinicIdToFetch);
        $stmtCheckClinic->execute();
        $clinicOwnerRecord = $stmtCheckClinic->fetch(PDO::FETCH_ASSOC);

        if (!$clinicOwnerRecord) {
            sendJsonResponse(['status' => 'error', 'message' => 'Clinic not found.'], 404);
        }
        if ($loggedInUserRole === 'CLINIC_OWNER' && $clinicOwnerRecord['user_id'] !== $loggedInUserId) {
            sendJsonResponse(['status' => 'error', 'message' => 'Unauthorized to view analytics for this clinic.'], 403);
        }

        $analyticsData = [
            'clinicId' => $clinicIdToFetch,
            'clinicName' => $clinicOwnerRecord['clinic_name'],
            'profileViews' => 0,
            'totalSpaceListings' => 0,
            'averageSpaceRentalPrice' => null,
            'mostCommonSpaceFeatures' => [],
            'therapistConnections' => 'N/A (Advanced Feature)', // Placeholder
            'inquiriesViaProfile' => 'N/A (Advanced Feature)',  // Placeholder
            'engagementRate' => 'N/A (Advanced Feature)',    // Placeholder
            'revenueGenerated' => null,                       // Placeholder
            'upcomingBookings' => 0,                          // Placeholder
            'peakHoursDemand' => (object)[],                  // Placeholder
            'dataLastUpdated' => date(DateTime::ATOM)
        ];

        // 1. Get Total Clinic Profile Views (from activity_logs)
        // This assumes you log an action like 'VIEW_CLINIC_PROFILE' with target_id = clinic_id
        $stmtViews = $pdo->prepare("
            SELECT COUNT(*) 
            FROM activity_logs 
            WHERE target_id = :clinic_id AND target_type = 'clinic' AND action = 'VIEW_CLINIC_PROFILE' 
            -- AND timestamp >= DATE_SUB(NOW(), INTERVAL 30 DAY) -- Optional: for past 30 days
        ");
        $stmtViews->bindParam(':clinic_id', $clinicIdToFetch);
        $stmtViews->execute();
        $analyticsData['profileViews'] = (int)$stmtViews->fetchColumn();

        // 2. Get Total Space Listings and Average Price
        $stmtSpaces = $pdo->prepare("
            SELECT COUNT(*) as total_listings, AVG(rental_price) as avg_price 
            FROM clinic_spaces 
            WHERE clinic_id = :clinic_id
        ");
        $stmtSpaces->bindParam(':clinic_id', $clinicIdToFetch);
        $stmtSpaces->execute();
        $spaceStats = $stmtSpaces->fetch(PDO::FETCH_ASSOC);
        if ($spaceStats) {
            $analyticsData['totalSpaceListings'] = (int)$spaceStats['total_listings'];
            $analyticsData['averageSpaceRentalPrice'] = $spaceStats['avg_price'] ? round((float)$spaceStats['avg_price'], 2) : null;
        }

        // 3. Get Most Common Space Features (Requires processing JSON arrays)
        $stmtFeatures = $pdo->prepare("SELECT features FROM clinic_spaces WHERE clinic_id = :clinic_id AND features IS NOT NULL AND features != '[]'");
        $stmtFeatures->bindParam(':clinic_id', $clinicIdToFetch);
        $stmtFeatures->execute();
        $allFeaturesArrays = $stmtFeatures->fetchAll(PDO::FETCH_COLUMN);
        
        $featureCounts = [];
        foreach ($allFeaturesArrays as $featuresJson) {
            $featuresArray = json_decode($featuresJson, true);
            if (is_array($featuresArray)) {
                foreach ($featuresArray as $feature) {
                    $feature = trim($feature);
                    if (!empty($feature)) {
                        $featureCounts[$feature] = ($featureCounts[$feature] ?? 0) + 1;
                    }
                }
            }
        }
        arsort($featureCounts); // Sort by count descending
        $analyticsData['mostCommonSpaceFeatures'] = array_slice(array_keys($featureCounts), 0, 5); // Top 5

        // Add some mock listing views and popular listings if spaces exist for this clinic (from previous mock)
        // This part remains mock as "views per space" isn't directly tracked in schema
        $mockListingStmt = $pdo->prepare("SELECT id, name FROM clinic_spaces WHERE clinic_id = :clinic_id ORDER BY created_at DESC LIMIT 5");
        $mockListingStmt->bindParam(':clinic_id', $clinicIdToFetch);
        $mockListingStmt->execute();
        $spacesForMock = $mockListingStmt->fetchAll(PDO::FETCH_ASSOC);

        $listingViewsData = [];
        $popularListingsData = [];
        foreach($spacesForMock as $idx => $space) {
            $views = rand(10, 100); // MOCK VIEWS
            $listingViewsData[$space['id']] = $views;
            if ($idx < 3) { 
                $popularListingsData[] = ['id' => $space['id'], 'name' => $space['name'], 'views' => $views];
            }
        }
        $analyticsData['listingViews'] = $listingViewsData; // Mock
        $analyticsData['popularListings'] = $popularListingsData; // Mock
        

        sendJsonResponse(['status' => 'success', 'analytics' => $analyticsData], 200);

    } catch (PDOException $e) {
        error_log("Database error fetching clinic analytics for clinic_id {$clinicIdToFetch}: " . $e->getMessage());
        sendJsonResponse(['status' => 'error', 'message' => 'A server error occurred while fetching clinic analytics.'], 500);
    }

}

// --- Invalid Method ---
else {
    sendJsonResponse(['status' => 'error', 'message' => 'Invalid request method. Only GET is accepted for this endpoint.'], 405);
}
?>