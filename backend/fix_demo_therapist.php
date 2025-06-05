<?php
// backend/fix_demo_therapist.php
// Script to check and fix the demo therapist account visibility

declare(strict_types=1);
ini_set('display_errors', '1'); // Show errors for this script
error_reporting(E_ALL);

// --- Includes ---
require_once __DIR__ . '/config/core.php';
require_once __DIR__ . '/config/db.php'; // Provides $pdo
require_once __DIR__ . '/vendor/autoload.php'; // Composer autoloader

// --- Check Demo Therapist Account Status ---
try {
    // First, check if the demo therapist account exists
    $email = "demo.therapist@theraway.net";
    $stmt = $pdo->prepare("SELECT u.id, u.name, u.email, u.role, td.account_status, td.is_overall_verified 
                          FROM users u 
                          LEFT JOIN therapists_data td ON u.id = td.user_id 
                          WHERE u.email = :email AND u.role = 'THERAPIST'");
    $stmt->bindParam(':email', $email);
    $stmt->execute();
    $therapist = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$therapist) {
        echo "<h2>Demo therapist account not found!</h2>";
        echo "<p>Please run the demo_accounts.php script first to create the demo accounts.</p>";
        exit;
    }

    echo "<h2>Demo Therapist Account Status</h2>";
    echo "<pre>";
    print_r($therapist);
    echo "</pre>";

    // Check if the account is live and verified
    $needsUpdate = false;
    $updates = [];

    if ($therapist['account_status'] !== 'live') {
        $needsUpdate = true;
        $updates[] = "Setting account_status to 'live'";
    }

    if (!$therapist['is_overall_verified']) {
        $needsUpdate = true;
        $updates[] = "Setting is_overall_verified to TRUE";
    }

    // Check if the therapist has locations with lat/lng for map view
    $locStmt = $pdo->prepare("SELECT locations FROM therapists_data WHERE user_id = :user_id");
    $locStmt->bindParam(':user_id', $therapist['id']);
    $locStmt->execute();
    $locData = $locStmt->fetch(PDO::FETCH_ASSOC);
    
    $locations = json_decode($locData['locations'] ?? '[]', true);
    $hasValidLocation = false;
    
    foreach ($locations as $location) {
        if (isset($location['lat']) && isset($location['lng'])) {
            $hasValidLocation = true;
            break;
        }
    }
    
    if (!$hasValidLocation) {
        $needsUpdate = true;
        $updates[] = "Adding lat/lng to locations for map view";
        
        // Update locations with lat/lng
        $updatedLocations = [];
        foreach ($locations as $location) {
            // Add mock coordinates if missing
            if (!isset($location['lat']) || !isset($location['lng'])) {
                $location['lat'] = 34.0522; // Los Angeles coordinates as example
                $location['lng'] = -118.2437;
            }
            $updatedLocations[] = $location;
        }
        
        // If no locations at all, add a default one
        if (empty($updatedLocations)) {
            $updatedLocations[] = [
                "address" => "123 Therapy Lane, Mindful City, CA 90210",
                "isPrimary" => true,
                "lat" => 34.0522,
                "lng" => -118.2437
            ];
        }
    }

    // Perform updates if needed
    if ($needsUpdate) {
        echo "<h3>Updates needed:</h3>";
        echo "<ul>";
        foreach ($updates as $update) {
            echo "<li>{$update}</li>";
        }
        echo "</ul>";

        $pdo->beginTransaction();

        // Update account status and verification
        $updateStmt = $pdo->prepare("UPDATE therapists_data SET 
                                    account_status = 'live', 
                                    is_overall_verified = TRUE
                                    WHERE user_id = :user_id");
        $updateStmt->bindParam(':user_id', $therapist['id']);
        $updateStmt->execute();

        // Update locations if needed
        if (isset($updatedLocations)) {
            $locationsJson = json_encode($updatedLocations);
            $locUpdateStmt = $pdo->prepare("UPDATE therapists_data SET locations = :locations WHERE user_id = :user_id");
            $locUpdateStmt->bindParam(':locations', $locationsJson);
            $locUpdateStmt->bindParam(':user_id', $therapist['id']);
            $locUpdateStmt->execute();
        }

        $pdo->commit();
        echo "<h3>Updates completed successfully!</h3>";
        
        // Verify the updates
        $verifyStmt = $pdo->prepare("SELECT account_status, is_overall_verified, locations FROM therapists_data WHERE user_id = :user_id");
        $verifyStmt->bindParam(':user_id', $therapist['id']);
        $verifyStmt->execute();
        $updatedData = $verifyStmt->fetch(PDO::FETCH_ASSOC);
        
        echo "<h3>Updated Therapist Data:</h3>";
        echo "<pre>";
        print_r($updatedData);
        echo "</pre>";
    } else {
        echo "<h3>No updates needed. Demo therapist account is properly configured.</h3>";
    }

    echo "<p>The demo therapist should now be visible on the Find Therapists page.</p>";
    echo "<p><a href='/app/' style='color: #045358; font-weight: bold;'>Go to the app</a> and check if the therapist is now visible.</p>";

} catch (PDOException $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    echo "<h2>Database Error</h2>";
    echo "<p>Error: " . $e->getMessage() . "</p>";
} catch (Exception $e) {
    echo "<h2>General Error</h2>";
    echo "<p>Error: " . $e->getMessage() . "</p>";
}
?>