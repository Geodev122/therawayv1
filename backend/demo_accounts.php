<?php
// backend/demo_accounts.php
// Script to create demo accounts for testing purposes

declare(strict_types=1);
ini_set('display_errors', '1'); // Show errors for this script
error_reporting(E_ALL);

// --- Includes ---
require_once __DIR__ . '/config/core.php';
require_once __DIR__ . '/config/db.php'; // Provides $pdo
require_once __DIR__ . '/vendor/autoload.php'; // Composer autoloader

// --- Create Demo Accounts ---
function createDemoAccount($pdo, $name, $email, $password, $role) {
    try {
        // Check if account already exists
        $stmt = $pdo->prepare("SELECT id FROM users WHERE email = :email");
        $stmt->bindParam(':email', $email);
        $stmt->execute();
        if ($stmt->fetch()) {
            echo "Account with email {$email} already exists.<br>";
            return null;
        }

        // Generate unique user ID
        $userId = 'user_' . generateUniqueId();
        
        // Hash the password
        $password_hash = password_hash($password, PASSWORD_BCRYPT);
        
        // Generate a default profile picture URL
        $defaultProfilePictureUrl = "https://picsum.photos/seed/{$userId}/200/200";
        
        // Insert new user
        $stmtUserInsert = $pdo->prepare("INSERT INTO users (id, name, email, password_hash, role, profile_picture_url) VALUES (:id, :name, :email, :password_hash, :role, :profile_picture_url)");
        $stmtUserInsert->bindParam(':id', $userId);
        $stmtUserInsert->bindParam(':name', $name);
        $stmtUserInsert->bindParam(':email', $email);
        $stmtUserInsert->bindParam(':password_hash', $password_hash);
        $stmtUserInsert->bindParam(':role', $role);
        $stmtUserInsert->bindParam(':profile_picture_url', $defaultProfilePictureUrl);
        
        $pdo->beginTransaction();
        
        if (!$stmtUserInsert->execute()) {
            throw new Exception("Failed to insert user into database for email: " . $email);
        }
        
        // Create role-specific data
        if ($role === 'THERAPIST') {
            $stmt_therapist = $pdo->prepare("INSERT INTO therapists_data (user_id, account_status, bio, whatsapp_number, specializations, languages, qualifications, locations, rating, review_count) VALUES (:user_id, 'live', :bio, :whatsapp, :specializations, :languages, :qualifications, :locations, :rating, :review_count)");
            
            $bio = "I am a demo therapist account for testing purposes. I specialize in cognitive behavioral therapy and mindfulness techniques to help clients overcome anxiety, depression, and stress-related issues.";
            $whatsapp = "+12345678900";
            $specializations = json_encode(["Cognitive Behavioral Therapy (CBT)", "Anxiety Counseling", "Depression Management"]);
            $languages = json_encode(["English", "Spanish"]);
            $qualifications = json_encode(["Licensed Clinical Psychologist", "PhD in Psychology", "Certified CBT Practitioner"]);
            $locations = json_encode([
                ["address" => "123 Therapy Lane, Mindful City, CA 90210", "isPrimary" => true]
            ]);
            $rating = 4.8;
            $review_count = 24;
            
            $stmt_therapist->bindParam(':user_id', $userId);
            $stmt_therapist->bindParam(':bio', $bio);
            $stmt_therapist->bindParam(':whatsapp', $whatsapp);
            $stmt_therapist->bindParam(':specializations', $specializations);
            $stmt_therapist->bindParam(':languages', $languages);
            $stmt_therapist->bindParam(':qualifications', $qualifications);
            $stmt_therapist->bindParam(':locations', $locations);
            $stmt_therapist->bindParam(':rating', $rating);
            $stmt_therapist->bindParam(':review_count', $review_count);
            
            if (!$stmt_therapist->execute()) {
                throw new Exception("Failed to insert therapist_data for user ID: " . $userId);
            }
            
            // Add a certification
            $certId = 'cert_' . generateUniqueId();
            $certName = "Clinical Psychology License";
            $certFileUrl = "https://example.com/demo-certification.pdf";
            $certCountry = "United States";
            
            $stmt_cert = $pdo->prepare("INSERT INTO certifications (id, therapist_user_id, name, file_url, country, is_verified_by_admin) VALUES (:id, :therapist_user_id, :name, :file_url, :country, :is_verified)");
            $isVerified = true;
            $stmt_cert->bindParam(':id', $certId);
            $stmt_cert->bindParam(':therapist_user_id', $userId);
            $stmt_cert->bindParam(':name', $certName);
            $stmt_cert->bindParam(':file_url', $certFileUrl);
            $stmt_cert->bindParam(':country', $certCountry);
            $stmt_cert->bindParam(':is_verified', $isVerified, PDO::PARAM_BOOL);
            
            if (!$stmt_cert->execute()) {
                throw new Exception("Failed to insert certification for therapist ID: " . $userId);
            }
            
        } elseif ($role === 'CLINIC_OWNER') {
            $clinic_id = 'clinic_' . generateUniqueId();
            $clinic_name = $name . "'s Wellness Center";
            
            $stmt_clinic = $pdo->prepare("INSERT INTO clinics_data (user_id, clinic_id, clinic_name, account_status, description, address, whatsapp_number, clinic_profile_picture_url, amenities, operating_hours, is_verified_by_admin) VALUES (:user_id, :clinic_id, :clinic_name, 'live', :description, :address, :whatsapp, :profile_pic, :amenities, :operating_hours, :is_verified)");
            
            $description = "A peaceful and professional clinic space designed for mental health practitioners. Our center offers private therapy rooms, group session spaces, and all the amenities needed for effective practice.";
            $address = "456 Wellness Boulevard, Serenity Heights, CA 90211";
            $whatsapp = "+12345678901";
            $profile_pic = "https://picsum.photos/seed/{$clinic_id}/600/400";
            $amenities = json_encode(["Waiting Room", "Wi-Fi", "Restroom", "Coffee & Tea", "Soundproofed Rooms"]);
            $operating_hours = json_encode([
                "Monday-Friday" => "9am - 7pm",
                "Saturday" => "10am - 4pm",
                "Sunday" => "Closed"
            ]);
            $is_verified = true;
            
            $stmt_clinic->bindParam(':user_id', $userId);
            $stmt_clinic->bindParam(':clinic_id', $clinic_id);
            $stmt_clinic->bindParam(':clinic_name', $clinic_name);
            $stmt_clinic->bindParam(':description', $description);
            $stmt_clinic->bindParam(':address', $address);
            $stmt_clinic->bindParam(':whatsapp', $whatsapp);
            $stmt_clinic->bindParam(':profile_pic', $profile_pic);
            $stmt_clinic->bindParam(':amenities', $amenities);
            $stmt_clinic->bindParam(':operating_hours', $operating_hours);
            $stmt_clinic->bindParam(':is_verified', $is_verified, PDO::PARAM_BOOL);
            
            if (!$stmt_clinic->execute()) {
                throw new Exception("Failed to insert clinics_data for user ID: " . $userId);
            }
            
            // Add a clinic space
            $spaceId = 'space_' . generateUniqueId();
            $spaceName = "Premium Therapy Room";
            $spaceDescription = "A comfortable, well-lit therapy room with modern furnishings and a calming atmosphere. Perfect for individual therapy sessions.";
            $spacePhotos = json_encode([
                "https://picsum.photos/seed/{$spaceId}_1/600/400",
                "https://picsum.photos/seed/{$spaceId}_2/600/400"
            ]);
            $rentalPrice = 45.00;
            $rentalDuration = "per hour";
            $rentalTerms = "Minimum booking: 2 hours. 24-hour cancellation policy applies.";
            $features = json_encode(["Comfortable Seating", "Natural Light", "Soundproof", "Wi-Fi", "Climate Control"]);
            
            $stmt_space = $pdo->prepare("INSERT INTO clinic_spaces (id, clinic_id, name, description, photos, rental_price, rental_duration, rental_terms, features) VALUES (:id, :clinic_id, :name, :description, :photos, :rental_price, :rental_duration, :rental_terms, :features)");
            
            $stmt_space->bindParam(':id', $spaceId);
            $stmt_space->bindParam(':clinic_id', $clinic_id);
            $stmt_space->bindParam(':name', $spaceName);
            $stmt_space->bindParam(':description', $spaceDescription);
            $stmt_space->bindParam(':photos', $spacePhotos);
            $stmt_space->bindParam(':rental_price', $rentalPrice);
            $stmt_space->bindParam(':rental_duration', $rentalDuration);
            $stmt_space->bindParam(':rental_terms', $rentalTerms);
            $stmt_space->bindParam(':features', $features);
            
            if (!$stmt_space->execute()) {
                throw new Exception("Failed to insert clinic_space for clinic ID: " . $clinic_id);
            }
        }
        
        $pdo->commit();
        echo "Successfully created {$role} account: {$email} with password: {$password}<br>";
        return $userId;
        
    } catch (Exception $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        echo "Error creating account: " . $e->getMessage() . "<br>";
        return null;
    }
}

// --- Main Execution ---
echo "<h1>Creating Demo Accounts</h1>";

// Create Therapist Demo Account
$therapistId = createDemoAccount(
    $pdo,
    "Dr. Sarah Johnson",
    "demo.therapist@theraway.net",
    "therapist123",
    "THERAPIST"
);

// Create Clinic Owner Demo Account
$clinicOwnerId = createDemoAccount(
    $pdo,
    "Michael Williams",
    "demo.clinic@theraway.net",
    "clinic123",
    "CLINIC_OWNER"
);

echo "<h2>Demo Account Creation Complete</h2>";
echo "<p>You can now log in with these accounts for testing purposes.</p>";
?>