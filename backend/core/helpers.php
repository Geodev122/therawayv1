<?php
// backend/core/helpers.php

declare(strict_types=1);

use Firebase\JWT\JWT;
use Firebase\JWT\Key;
use Firebase\JWT\ExpiredException;
use Firebase\JWT\SignatureInvalidException;
use Firebase\JWT\BeforeValidException;

/**
 * Sends a JSON response and exits the script.
 * @param mixed $data The data to encode as JSON.
 * @param int $statusCode HTTP status code (default 200).
 */
if (!function_exists('sendJsonResponse')) {
    function sendJsonResponse($data, int $statusCode = 200): void {
        if (!headers_sent()) {
            header('Content-Type: application/json');
            http_response_code($statusCode);
        }
        echo json_encode($data);
        exit;
    }
}

/**
 * Generates a more unique ID with a prefix.
 * @param string $prefix Optional prefix for the ID.
 * @return string The generated unique ID.
 */
if (!function_exists('generateUniqueId')) {
    function generateUniqueId(string $prefix = ''): string {
        // uniqid with more_entropy and random_bytes for better uniqueness
        return $prefix . uniqid('', true) . bin2hex(random_bytes(6));
    }
}

/**
 * Gets authenticated user data from JWT.
 * Sends error response and exits if authentication fails or role is not allowed.
 * @param string|null $jwtKey The JWT secret key. If null, reads from JWT_SECRET_KEY constant.
 * @param array $allowedRoles Array of roles allowed (e.g., ['CLIENT', 'THERAPIST']). If empty, allows any authenticated user.
 * @return array Decoded JWT user data (e.g., ['userId' => string, 'role' => string, 'name' => string]).
 */
if (!function_exists('getAuthenticatedUser')) {
    function getAuthenticatedUser(?string $jwtKey = null, array $allowedRoles = []): array {
        // Check if JWT class exists before attempting to use it
        if (!class_exists('Firebase\JWT\JWT')) {
            error_log("Firebase JWT class not found. Check if dependencies are installed.");
            sendJsonResponse(['status' => 'error', 'message' => 'Server authentication system unavailable.'], 500);
        }

        $keyToUse = $jwtKey ?? (defined('JWT_SECRET_KEY') ? JWT_SECRET_KEY : null);
        if (!$keyToUse) {
            error_log("JWT_SECRET_KEY not available in getAuthenticatedUser");
            sendJsonResponse(['status' => 'error', 'message' => 'Server authentication configuration error.'], 500);
        }

        if (!isset($_SERVER['HTTP_AUTHORIZATION'])) {
            sendJsonResponse(['status' => 'error', 'message' => 'Authorization header missing.'], 401);
        }
        $authHeader = $_SERVER['HTTP_AUTHORIZATION'];
        
        // Check if Authorization header is properly formatted
        if (!str_contains($authHeader, ' ')) {
            sendJsonResponse(['status' => 'error', 'message' => 'Invalid Authorization header format.'], 401);
        }
        
        list($type, $token) = explode(' ', $authHeader, 2);

        if (strcasecmp($type, 'Bearer') !== 0 || empty($token)) {
            sendJsonResponse(['status' => 'error', 'message' => 'Invalid token type or token is empty.'], 401);
        }

        try {
            $decoded = JWT::decode($token, new Key($keyToUse, 'HS256'));
            if (!isset($decoded->data) || !isset($decoded->data->userId) || !isset($decoded->data->role)) {
                sendJsonResponse(['status' => 'error', 'message' => 'Invalid token payload.'], 401);
            }
            if (!empty($allowedRoles) && !in_array($decoded->data->role, $allowedRoles)) {
                sendJsonResponse(['status' => 'error', 'message' => 'Access denied. Required role: ' . implode(' or ', $allowedRoles) . '.'], 403);
            }
            // Ensure essential data fields exist, with fallbacks
            $userId = $decoded->data->userId;
            $role = $decoded->data->role;
            $name = isset($decoded->data->name) ? $decoded->data->name : 'User'; // Default name

            return ['userId' => $userId, 'role' => $role, 'name' => $name];

        } catch (ExpiredException $e) {
            sendJsonResponse(['status' => 'error', 'message' => 'Token has expired.'], 401);
        } catch (SignatureInvalidException $e) {
            sendJsonResponse(['status' => 'error', 'message' => 'Token signature invalid.'], 401);
        } catch (BeforeValidException $e) {
            sendJsonResponse(['status' => 'error', 'message' => 'Token not yet valid.'], 401);
        } catch (Exception $e) {
            error_log("JWT Decode Error in getAuthenticatedUser: " . $e->getMessage());
            sendJsonResponse(['status' => 'error', 'message' => 'Invalid token: ' . $e->getMessage()], 401);
        }
        exit; // Should not be reached
    }
}

/**
 * Authenticates an ADMIN user from JWT.
 * Wrapper around getAuthenticatedUser for admin-specific checks.
 * @param string|null $jwtKey The JWT secret key.
 * @return array Decoded JWT admin user data.
 */
if (!function_exists('authenticateAdmin')) {
    function authenticateAdmin(?string $jwtKey = null): array {
        return getAuthenticatedUser($jwtKey, ['ADMIN']);
    }
}

/**
 * Gets the clinic_id for an authenticated CLINIC_OWNER.
 * @param string $ownerUserId The user_id of the clinic owner.
 * @param PDO $pdo PDO database connection object.
 * @return string|null The clinic_id or null if not found.
 */
if (!function_exists('getClinicIdForOwner')) {
    function getClinicIdForOwner(string $ownerUserId, PDO $pdo): ?string {
        try {
            $stmt = $pdo->prepare("SELECT clinic_id FROM clinics_data WHERE user_id = :user_id");
            $stmt->bindParam(':user_id', $ownerUserId);
            $stmt->execute();
            $result = $stmt->fetch(PDO::FETCH_ASSOC);
            return $result ? $result['clinic_id'] : null;
        } catch (PDOException $e) {
            error_log("Error fetching clinic_id for owner {$ownerUserId}: " . $e->getMessage());
            return null;
        }
    }
}

/**
 * Fetches the full therapist profile details.
 * @param string $userId The therapist's user ID.
 * @param PDO $pdo The PDO database connection object.
 * @return array|null The therapist profile or null if not found.
 */
if (!function_exists('fetchFullTherapistProfile')) {
    function fetchFullTherapistProfile(string $userId, PDO $pdo): ?array {
        try {
            $stmt = $pdo->prepare("
                SELECT 
                    u.id, u.name, u.email, u.profile_picture_url,
                    td.bio, td.whatsapp_number, td.intro_video_url, td.account_status,
                    td.admin_notes, td.membership_application_date, td.membership_payment_receipt_url,
                    td.membership_status_message, td.membership_renewal_date,
                    td.specializations, td.languages, td.qualifications, td.locations,
                    td.rating, td.review_count, td.profile_views, td.likes_count,
                    td.is_overall_verified, td.availability
                FROM users u
                LEFT JOIN therapists_data td ON u.id = td.user_id
                WHERE u.id = :userId AND u.role = 'THERAPIST'
            ");
            $stmt->bindParam(':userId', $userId);
            $stmt->execute();
            $therapist = $stmt->fetch(PDO::FETCH_ASSOC);

            if ($therapist) {
                $jsonFields = ['specializations', 'languages', 'qualifications', 'locations', 'availability'];
                foreach ($jsonFields as $field) {
                    if (isset($therapist[$field]) && $therapist[$field] !== null) {
                        $decoded = json_decode($therapist[$field], true);
                        $therapist[$field] = is_array($decoded) ? $decoded : []; 
                    } else {
                        $therapist[$field] = [];
                    }
                }
                $certStmt = $pdo->prepare("SELECT id, name, file_url, country, is_verified_by_admin, verification_notes, uploaded_at FROM certifications WHERE therapist_user_id = :userId ORDER BY uploaded_at DESC");
                $certStmt->bindParam(':userId', $userId);
                $certStmt->execute();
                $therapist['certifications'] = $certStmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
                
                $therapist['membershipApplication'] = [
                    'date' => $therapist['membership_application_date'],
                    'paymentReceiptUrl' => $therapist['membership_payment_receipt_url'],
                    'statusMessage' => $therapist['membership_status_message'],
                ];
                unset($therapist['membership_application_date'], $therapist['membership_payment_receipt_url'], $therapist['membership_status_message']);
                
                $therapist['isVerified'] = (bool) ($therapist['is_overall_verified'] ?? false);
                unset($therapist['is_overall_verified']);
            }
            return $therapist;
        } catch (PDOException $e) {
            error_log("Error fetching full therapist profile for user {$userId}: " . $e->getMessage());
            return null;
        }
    }
}

/**
 * Fetches the full clinic profile including owner info and spaces.
 * @param string|null $clinicId The clinic's unique ID.
 * @param string|null $ownerId The clinic owner's user ID.
 * @param PDO $pdo The PDO database connection object.
 * @return array|null The clinic profile or null if not found.
 */
if (!function_exists('fetchFullClinicProfile')) {
    function fetchFullClinicProfile(?string $clinicId, ?string $ownerId, PDO $pdo): ?array {
        if (empty($clinicId) && empty($ownerId)) {
            return null;
        }
        try {
            $sql = "
                SELECT 
                    cd.clinic_id as id, cd.user_id as ownerId, cd.clinic_name as name, cd.description, 
                    cd.address, cd.latitude, cd.longitude, cd.clinic_profile_picture_url as profilePictureUrl, 
                    cd.clinic_photos as photos, cd.amenities, cd.operating_hours, cd.services,
                    cd.whatsapp_number as whatsappNumber, cd.is_verified_by_admin as isVerified, 
                    cd.account_status as accountStatus, cd.admin_notes as adminNotes,
                    cd.theraway_membership_status, cd.theraway_membership_tier_name,
                    cd.theraway_membership_renewal_date, cd.theraway_membership_application_date,
                    cd.theraway_membership_payment_receipt_url,
                    u.name as ownerName, u.email as ownerEmail
                FROM clinics_data cd
                JOIN users u ON cd.user_id = u.id
            ";

            $identifier = null;
            if (!empty($clinicId)) {
                $sql .= " WHERE cd.clinic_id = :identifier";
                $identifier = $clinicId;
            } elseif (!empty($ownerId)) {
                $sql .= " WHERE cd.user_id = :identifier AND u.role = 'CLINIC_OWNER'";
                $identifier = $ownerId;
            } else { return null; }
            
            $stmt = $pdo->prepare($sql);
            $stmt->bindParam(':identifier', $identifier);
            $stmt->execute();
            $clinic = $stmt->fetch(PDO::FETCH_ASSOC);

            if ($clinic) {
                $jsonFields = ['photos', 'amenities', 'operating_hours', 'services'];
                foreach ($jsonFields as $field) {
                    if (isset($clinic[$field]) && $clinic[$field] !== null) {
                        $decoded = json_decode($clinic[$field], true);
                        $clinic[$field] = is_array($decoded) ? $decoded : ($field === 'operating_hours' && is_object($decoded) ? (array)$decoded : []);
                    } else {
                        $clinic[$field] = ($field === 'operating_hours') ? (object)[] : [];
                    }
                }
                $clinic['theraWayMembership'] = [
                    'status' => $clinic['theraway_membership_status'] ?? 'none',
                    'tierName' => $clinic['theraway_membership_tier_name'],
                    'renewalDate' => $clinic['theraway_membership_renewal_date'],
                    'applicationDate' => $clinic['theraway_membership_application_date'],
                    'paymentReceiptUrl' => $clinic['theraway_membership_payment_receipt_url'],
                ];
                unset($clinic['theraway_membership_status'], $clinic['theraway_membership_tier_name'], $clinic['theraway_membership_renewal_date'], $clinic['theraway_membership_application_date'], $clinic['theraway_membership_payment_receipt_url']);
                
                $spaceStmt = $pdo->prepare("SELECT id, name, description, photos, rental_price, rental_duration, rental_terms, features FROM clinic_spaces WHERE clinic_id = :clinic_id ORDER BY created_at DESC");
                $spaceStmt->bindParam(':clinic_id', $clinic['id']);
                $spaceStmt->execute();
                $spaces = $spaceStmt->fetchAll(PDO::FETCH_ASSOC);
                
                $clinic['listings'] = array_map(function($space) use ($clinic) {
                    $spaceJsonFields = ['photos', 'features'];
                    foreach ($spaceJsonFields as $field) {
                        if (isset($space[$field]) && $space[$field] !== null) {
                             $decodedSpace = json_decode($space[$field], true);
                             $space[$field] = is_array($decodedSpace) ? $decodedSpace : [];
                        } else {
                             $space[$field] = [];
                        }
                    }
                    $space['clinicId'] = $clinic['id']; $space['clinicName'] = $clinic['name']; $space['clinicAddress'] = $clinic['address'];
                    return $space;
                }, $spaces);
            }
            return $clinic;
        } catch (PDOException $e) {
            error_log("Error fetching full clinic profile: " . $e->getMessage());
            return null;
        }
    }
}

?>