<?php
// backend/api/clinic_profile.php

declare(strict_types=1);
ini_set('display_errors', '0'); // Log errors, don't display in API output
error_reporting(E_ALL);

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

if (!$jwtKey && $method === 'PUT') { // JWT key is essential for PUT
    error_log("JWT_SECRET_KEY is not defined in core.php for clinic_profile.php PUT request");
    sendJsonResponse(['status' => 'error', 'message' => 'Server configuration error (JWT).'], 500);
}

/**
 * Helper function to get authenticated user ID and role from JWT.
 * Used for PUT requests to authorize.
 * @param string $jwtKey The JWT secret key.
 * @return array ['userId' => string, 'role' => string] or exits.
 */
function getAuthenticatedUser(string $jwtKey): array {
    if (!isset($_SERVER['HTTP_AUTHORIZATION'])) {
        sendJsonResponse(['status' => 'error', 'message' => 'Authorization header missing.'], 401);
    }
    $authHeader = $_SERVER['HTTP_AUTHORIZATION'];
    list($type, $token) = explode(' ', $authHeader, 2);

    if (strcasecmp($type, 'Bearer') !== 0 || empty($token)) {
        sendJsonResponse(['status' => 'error', 'message' => 'Invalid token type or token is empty.'], 401);
    }

    try {
        $decoded = JWT::decode($token, new Key($jwtKey, 'HS256'));
        if (!isset($decoded->data) || !isset($decoded->data->userId) || !isset($decoded->data->role)) {
            sendJsonResponse(['status' => 'error', 'message' => 'Invalid token payload.'], 401);
        }
        return ['userId' => $decoded->data->userId, 'role' => $decoded->data->role];
    } catch (ExpiredException $e) {
        sendJsonResponse(['status' => 'error', 'message' => 'Token has expired.'], 401);
    } catch (SignatureInvalidException $e) {
        sendJsonResponse(['status' => 'error', 'message' => 'Token signature invalid.'], 401);
    } catch (BeforeValidException $e) {
        sendJsonResponse(['status' => 'error', 'message' => 'Token not yet valid.'], 401);
    } catch (Exception $e) {
        error_log("JWT Decode Error for clinic_profile: " . $e->getMessage());
        sendJsonResponse(['status' => 'error', 'message' => 'Invalid token: ' . $e->getMessage()], 401);
    }
    exit;
}


/**
 * Fetches the full clinic profile including owner info and spaces.
 * @param string|null $clinicId The clinic's unique ID.
 * @param string|null $ownerId The clinic owner's user ID.
 * @param PDO $pdo The PDO database connection object.
 * @return array|null The clinic profile or null if not found.
 */
function fetchFullClinicProfile(?string $clinicId, ?string $ownerId, PDO $pdo): ?array {
    if (empty($clinicId) && empty($ownerId)) {
        return null;
    }

    $sql = "
        SELECT 
            cd.clinic_id as id, 
            cd.user_id as ownerId, 
            cd.clinic_name as name, 
            cd.description, 
            cd.address, 
            cd.latitude, 
            cd.longitude, 
            cd.clinic_profile_picture_url as profilePictureUrl, 
            cd.clinic_photos as photos, 
            cd.amenities, 
            cd.operating_hours, 
            cd.services,
            cd.whatsapp_number as whatsappNumber, 
            cd.is_verified_by_admin as isVerified, 
            cd.account_status as accountStatus, 
            cd.admin_notes as adminNotes,
            cd.theraway_membership_status,
            cd.theraway_membership_tier_name,
            cd.theraway_membership_renewal_date,
            cd.theraway_membership_application_date,
            cd.theraway_membership_payment_receipt_url,
            u.name as ownerName, 
            u.email as ownerEmail
        FROM clinics_data cd
        JOIN users u ON cd.user_id = u.id
    ";

    if (!empty($clinicId)) {
        $sql .= " WHERE cd.clinic_id = :identifier";
        $identifier = $clinicId;
    } elseif (!empty($ownerId)) {
        $sql .= " WHERE cd.user_id = :identifier AND u.role = 'CLINIC_OWNER'";
        $identifier = $ownerId;
    } else {
        return null;
    }
    
    $stmt = $pdo->prepare($sql);
    $stmt->bindParam(':identifier', $identifier);
    $stmt->execute();
    $clinic = $stmt->fetch(PDO::FETCH_ASSOC);

    if ($clinic) {
        // Decode JSON fields
        $jsonFields = ['photos', 'amenities', 'operating_hours', 'services'];
        foreach ($jsonFields as $field) {
            if (isset($clinic[$field]) && $clinic[$field] !== null) {
                $decoded = json_decode($clinic[$field], true);
                $clinic[$field] = is_array($decoded) ? $decoded : ($field === 'operating_hours' && is_object($decoded) ? (array)$decoded : []);
            } else {
                $clinic[$field] = ($field === 'operating_hours') ? (object)[] : [];
            }
        }

        // Structure theraWayMembership object
        $clinic['theraWayMembership'] = [
            'status' => $clinic['theraway_membership_status'] ?? 'none',
            'tierName' => $clinic['theraway_membership_tier_name'],
            'renewalDate' => $clinic['theraway_membership_renewal_date'],
            'applicationDate' => $clinic['theraway_membership_application_date'],
            'paymentReceiptUrl' => $clinic['theraway_membership_payment_receipt_url'],
        ];
        unset(
            $clinic['theraway_membership_status'], $clinic['theraway_membership_tier_name'],
            $clinic['theraway_membership_renewal_date'], $clinic['theraway_membership_application_date'],
            $clinic['theraway_membership_payment_receipt_url']
        );
        
        // Fetch clinic spaces (listings)
        $spaceStmt = $pdo->prepare("SELECT id, name, description, photos, rental_price, rental_duration, rental_terms, features FROM clinic_spaces WHERE clinic_id = :clinic_id ORDER BY created_at DESC");
        $spaceStmt->bindParam(':clinic_id', $clinic['id']); // Use clinic_id from clinics_data
        $spaceStmt->execute();
        $spaces = $spaceStmt->fetchAll(PDO::FETCH_ASSOC);
        
        $clinic['listings'] = array_map(function($space) {
            $spaceJsonFields = ['photos', 'features'];
            foreach ($spaceJsonFields as $field) {
                if (isset($space[$field]) && $space[$field] !== null) {
                    $decoded = json_decode($space[$field], true);
                    $space[$field] = is_array($decoded) ? $decoded : [];
                } else {
                     $space[$field] = [];
                }
            }
             // Add clinicName and clinicAddress to each space for denormalization consistency with frontend
            $space['clinicId'] = $clinic['id'];
            $space['clinicName'] = $clinic['name'];
            $space['clinicAddress'] = $clinic['address'];
            return $space;
        }, $spaces);
    }
    return $clinic;
}


// --- Handle GET Request: Fetch clinic profile ---
if ($method === 'GET') {
    $clinicIdToFetch = $_GET['clinicId'] ?? null;
    $ownerIdToFetch = $_GET['ownerId'] ?? null;

    if (empty($clinicIdToFetch) && empty($ownerIdToFetch)) {
        sendJsonResponse(['status' => 'error', 'message' => 'Clinic ID or Owner ID is required to fetch profile.'], 400);
    }

    try {
        $clinicProfile = fetchFullClinicProfile($clinicIdToFetch, $ownerIdToFetch, $pdo);

        if ($clinicProfile) {
            sendJsonResponse(['status' => 'success', 'clinic' => $clinicProfile], 200);
        } else {
            sendJsonResponse(['status' => 'not_found', 'message' => 'Clinic profile not found or user is not a clinic owner.'], 404);
        }
    } catch (PDOException $e) {
        error_log("Database error fetching clinic profile: " . $e->getMessage());
        sendJsonResponse(['status' => 'error', 'message' => 'A server error occurred while fetching clinic profile.'], 500);
    }
}

// --- Handle PUT Request: Update clinic profile ---
elseif ($method === 'PUT') {
    $authData = getAuthenticatedUser($jwtKey);
    $loggedInUserId = $authData['userId'];
    $loggedInUserRole = $authData['role'];

    $input = json_decode(file_get_contents('php://input'), true);

    if (json_last_error() !== JSON_ERROR_NONE || !isset($input['id'])) { // Expecting clinic_id as 'id'
        sendJsonResponse(['status' => 'error', 'message' => 'Invalid JSON input or missing clinic ID.'], 400);
    }

    $clinicIdToUpdate = $input['id'];

    // --- Fetch current clinic to verify ownership if not admin ---
    try {
        $stmtOwnerCheck = $pdo->prepare("SELECT user_id FROM clinics_data WHERE clinic_id = :clinic_id");
        $stmtOwnerCheck->bindParam(':clinic_id', $clinicIdToUpdate);
        $stmtOwnerCheck->execute();
        $currentClinicOwner = $stmtOwnerCheck->fetch(PDO::FETCH_ASSOC);

        if (!$currentClinicOwner) {
            sendJsonResponse(['status' => 'error', 'message' => 'Clinic not found for update.'], 404);
        }

        // Authorization: Only the clinic owner or an ADMIN can update.
        if ($loggedInUserRole !== 'ADMIN' && $loggedInUserId !== $currentClinicOwner['user_id']) {
            sendJsonResponse(['status' => 'error', 'message' => 'Unauthorized to update this clinic profile.'], 403);
        }

        // --- Prepare fields for update ---
        $updateFields = [];
        $params = [':clinic_id_bind' => $clinicIdToUpdate]; // Use a different placeholder name for clinic_id in WHERE

        // Fields from 'clinics_data' table
        if (isset($input['name'])) { $updateFields[] = "clinic_name = :clinic_name"; $params[':clinic_name'] = trim($input['name']); }
        if (isset($input['description'])) { $updateFields[] = "description = :description"; $params[':description'] = trim($input['description']); }
        if (isset($input['address'])) { $updateFields[] = "address = :address"; $params[':address'] = trim($input['address']); }
        if (isset($input['latitude'])) { $updateFields[] = "latitude = :latitude"; $params[':latitude'] = (float)$input['latitude']; }
        if (isset($input['longitude'])) { $updateFields[] = "longitude = :longitude"; $params[':longitude'] = (float)$input['longitude']; }
        if (isset($input['profilePictureUrl'])) { $updateFields[] = "clinic_profile_picture_url = :profile_picture_url"; $params[':profile_picture_url'] = filter_var(trim($input['profilePictureUrl']), FILTER_SANITIZE_URL); }
        if (isset($input['photos']) && is_array($input['photos'])) { $updateFields[] = "clinic_photos = :clinic_photos"; $params[':clinic_photos'] = json_encode(array_map('trim', $input['photos'])); }
        if (isset($input['amenities']) && is_array($input['amenities'])) { $updateFields[] = "amenities = :amenities"; $params[':amenities'] = json_encode(array_map('trim', $input['amenities'])); }
        if (isset($input['operatingHours']) && (is_array($input['operatingHours']) || is_object($input['operatingHours']))) { $updateFields[] = "operating_hours = :operating_hours"; $params[':operating_hours'] = json_encode($input['operatingHours']); } // operatingHours is an object
        if (isset($input['services']) && is_array($input['services'])) { $updateFields[] = "services = :services"; $params[':services'] = json_encode($input['services']);}
        if (isset($input['whatsappNumber'])) { $updateFields[] = "whatsapp_number = :whatsapp_number"; $params[':whatsapp_number'] = preg_replace('/[^\d+]/', '', $input['whatsappNumber']);}

        // Admin-only updatable fields
        if ($loggedInUserRole === 'ADMIN') {
            if (isset($input['accountStatus']) && in_array($input['accountStatus'], ['draft', 'pending_approval', 'live', 'rejected'])) {
                $updateFields[] = "account_status = :account_status"; $params[':account_status'] = $input['accountStatus'];
            }
            if (isset($input['isVerified'])) { // Renamed from is_verified_by_admin in frontend type
                $updateFields[] = "is_verified_by_admin = :is_verified_by_admin"; $params[':is_verified_by_admin'] = (bool)$input['isVerified'];
            }
            if (isset($input['adminNotes'])) { // Allow setting to empty string
                $updateFields[] = "admin_notes = :admin_notes"; $params[':admin_notes'] = trim($input['adminNotes']);
            }
        }

        if (count($updateFields) === 0) {
            sendJsonResponse(['status' => 'success', 'message' => 'No changes detected for clinic profile.'], 200);
        }
        
        $updateFields[] = "updated_at = NOW()"; // Always update this timestamp

        $sql = "UPDATE clinics_data SET " . implode(", ", $updateFields) . " WHERE clinic_id = :clinic_id_bind";
        $stmtUpdate = $pdo->prepare($sql);
        
        if ($stmtUpdate->execute($params)) {
            $updatedClinicProfile = fetchFullClinicProfile($clinicIdToUpdate, null, $pdo);
            sendJsonResponse(['status' => 'success', 'message' => 'Clinic profile updated successfully.', 'clinic' => $updatedClinicProfile], 200);
        } else {
            error_log("Failed to update clinic ID: " . $clinicIdToUpdate);
            sendJsonResponse(['status' => 'error', 'message' => 'Failed to update clinic profile.'], 500);
        }

    } catch (PDOException $e) {
        error_log("Database error updating clinic profile: " . $e->getMessage());
        sendJsonResponse(['status' => 'error', 'message' => 'A server error occurred while updating clinic profile.'], 500);
    }

}

// --- Invalid Method ---
else {
    sendJsonResponse(['status' => 'error', 'message' => 'Invalid request method for clinic profile.'], 405);
}
?>