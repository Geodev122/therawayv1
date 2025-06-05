<?php
// backend/api/clinic_spaces.php

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

if (!$jwtKey && in_array($method, ['POST', 'PUT', 'DELETE'])) {
    error_log("JWT_SECRET_KEY is not defined in core.php for clinic_spaces.php (Authenticated Action)");
    sendJsonResponse(['status' => 'error', 'message' => 'Server configuration error (JWT).'], 500);
}

/**
 * Helper function to get authenticated user ID and role from JWT.
 * Used for POST/PUT/DELETE to authorize.
 * @param string $jwtKey The JWT secret key.
 * @param array $allowedRoles Array of roles allowed to perform the action.
 * @return array ['userId' => string, 'role' => string] or exits.
 */
function getAuthenticatedUser(string $jwtKey, array $allowedRoles = ['CLINIC_OWNER', 'ADMIN']): array {
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
        error_log("JWT Decode Error for clinic_spaces: " . $e->getMessage());
        sendJsonResponse(['status' => 'error', 'message' => 'Invalid token: ' . $e->getMessage()], 401);
    }
    exit;
}

/**
 * Helper function to get the clinic_id for an authenticated CLINIC_OWNER.
 * @param string $ownerUserId The user_id of the clinic owner.
 * @param PDO $pdo PDO object.
 * @return string|null The clinic_id or null if not found.
 */
function getClinicIdForOwner(string $ownerUserId, PDO $pdo): ?string {
    $stmt = $pdo->prepare("SELECT clinic_id FROM clinics_data WHERE user_id = :user_id");
    $stmt->bindParam(':user_id', $ownerUserId);
    $stmt->execute();
    $result = $stmt->fetch(PDO::FETCH_ASSOC);
    return $result ? $result['clinic_id'] : null;
}

/**
 * Helper function to fetch the full clinic profile, including listings.
 * Useful for returning consistent data after modifications.
 */
function fetchFullClinicProfileByClinicId(string $clinicId, PDO $pdo): ?array {
    $stmt = $pdo->prepare("
        SELECT 
            cd.clinic_id as id, cd.user_id as ownerId, cd.clinic_name as name, cd.description, cd.address, 
            cd.latitude, cd.longitude, cd.clinic_profile_picture_url as profilePictureUrl, 
            cd.clinic_photos as photos, cd.amenities, cd.operating_hours, cd.services,
            cd.whatsapp_number as whatsappNumber, cd.is_verified_by_admin as isVerified, 
            cd.account_status as accountStatus, cd.admin_notes as adminNotes,
            cd.theraway_membership_status, cd.theraway_membership_tier_name,
            cd.theraway_membership_renewal_date, cd.theraway_membership_application_date,
            cd.theraway_membership_payment_receipt_url,
            u.name as ownerName, u.email as ownerEmail
        FROM clinics_data cd
        JOIN users u ON cd.user_id = u.id
        WHERE cd.clinic_id = :clinic_id
    ");
    $stmt->bindParam(':clinic_id', $clinicId);
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
                if (isset($space[$field]) && $space[$field] !== null) $space[$field] = json_decode($space[$field], true);
                else $space[$field] = [];
            }
            $space['clinicId'] = $clinic['id']; $space['clinicName'] = $clinic['name']; $space['clinicAddress'] = $clinic['address'];
            return $space;
        }, $spaces);
    }
    return $clinic;
}


// --- Handle GET Request ---
if ($method === 'GET') {
    $clinicIdForFilter = $_GET['clinicId'] ?? null; // Fetch spaces for a specific clinic (owner/admin view)
    
    if ($clinicIdForFilter) {
        // Requires auth if fetching for a specific clinic (owner or admin)
        if (!$jwtKey) sendJsonResponse(['status' => 'error', 'message' => 'Server JWT configuration missing.'], 500);
        $authData = getAuthenticatedUser($jwtKey, ['CLINIC_OWNER', 'ADMIN']);
        
        // Authorization check: if CLINIC_OWNER, they can only fetch for their own clinic_id
        if ($authData['role'] === 'CLINIC_OWNER') {
            $ownedClinicId = getClinicIdForOwner($authData['userId'], $pdo);
            if ($ownedClinicId !== $clinicIdForFilter) {
                sendJsonResponse(['status' => 'error', 'message' => 'Unauthorized to view spaces for this clinic.'], 403);
            }
        }

        $sql = "SELECT cs.*, cd.clinic_name as clinicName, cd.address as clinicAddress 
                FROM clinic_spaces cs 
                JOIN clinics_data cd ON cs.clinic_id = cd.clinic_id
                WHERE cs.clinic_id = :clinic_id ORDER BY cs.created_at DESC";
        $params = [':clinic_id' => $clinicIdForFilter];

        try {
            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);
            $spaces = $stmt->fetchAll(PDO::FETCH_ASSOC);
            foreach ($spaces as &$space) { // Decode JSON fields
                if (isset($space['photos'])) $space['photos'] = json_decode($space['photos'], true) ?: [];
                if (isset($space['features'])) $space['features'] = json_decode($space['features'], true) ?: [];
            }
            sendJsonResponse(['status' => 'success', 'spaces' => $spaces], 200);
        } catch (PDOException $e) {
            error_log("DB Error fetching spaces for clinic {$clinicIdForFilter}: " . $e->getMessage());
            sendJsonResponse(['status' => 'error', 'message' => 'Failed to fetch clinic spaces.'], 500);
        }

    } else {
        // Public endpoint: Fetch all spaces from 'live' clinics with pagination and filters
        $page = isset($_GET['page']) ? max(1, (int)$_GET['page']) : 1;
        $limit = isset($_GET['limit']) ? max(1, min(50, (int)$_GET['limit'])) : 10; // Max 50 per page
        $offset = ($page - 1) * $limit;

        $locationFilter = isset($_GET['location']) ? trim($_GET['location']) : null;
        $minPriceFilter = isset($_GET['minPrice']) ? (float)$_GET['minPrice'] : null;
        $maxPriceFilter = isset($_GET['maxPrice']) ? (float)$_GET['maxPrice'] : null;
        $featuresFilter = isset($_GET['features']) ? explode(',', trim($_GET['features'])) : [];
        $featuresFilter = array_map('trim', array_filter($featuresFilter));


        $whereClauses = ["cd.account_status = 'live'"]; // Only spaces from live clinics
        $params = [];

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
        foreach ($featuresFilter as $index => $feature) {
            if (!empty($feature)) {
                $key = ":feature{$index}";
                // Basic JSON LIKE search (for MariaDB < 10.2 or MySQL < 5.7, might need full text or proper JSON functions)
                // For newer versions: JSON_CONTAINS(cs.features, JSON_QUOTE(:featureX))
                $whereClauses[] = "JSON_UNQUOTE(JSON_EXTRACT(cs.features, '$[*]')) LIKE " . $pdo->quote('%"' . $feature . '"%');
            }
        }
        
        $sqlWhere = count($whereClauses) > 0 ? " WHERE " . implode(" AND ", $whereClauses) : "";
        $sqlOrder = " ORDER BY cs.created_at DESC";

        try {
            $countSql = "SELECT COUNT(cs.id) FROM clinic_spaces cs JOIN clinics_data cd ON cs.clinic_id = cd.clinic_id" . $sqlWhere;
            $countStmt = $pdo->prepare($countSql);
            $countStmt->execute($params);
            $totalItems = (int)$countStmt->fetchColumn();
            $totalPages = ceil($totalItems / $limit);

            $mainSql = "SELECT cs.*, cd.clinic_name as clinicName, cd.address as clinicAddress 
                        FROM clinic_spaces cs 
                        JOIN clinics_data cd ON cs.clinic_id = cd.clinic_id" 
                        . $sqlWhere . $sqlOrder . " LIMIT :limit OFFSET :offset";
            
            $stmt = $pdo->prepare($mainSql);
            foreach ($params as $key => $value) {
                $stmt->bindValue($key, $value);
            }
            $stmt->bindParam(':limit', $limit, PDO::PARAM_INT);
            $stmt->bindParam(':offset', $offset, PDO::PARAM_INT);
            $stmt->execute();
            $spaces = $stmt->fetchAll(PDO::FETCH_ASSOC);

            foreach ($spaces as &$space) { // Decode JSON fields
                if (isset($space['photos'])) $space['photos'] = json_decode($space['photos'], true) ?: [];
                if (isset($space['features'])) $space['features'] = json_decode($space['features'], true) ?: [];
            }

            sendJsonResponse([
                'status' => 'success', 
                'spaces' => $spaces,
                'pagination' => ['currentPage' => $page, 'totalPages' => $totalPages, 'totalItems' => $totalItems, 'itemsPerPage' => $limit]
            ], 200);

        } catch (PDOException $e) {
            error_log("DB Error fetching all spaces: " . $e->getMessage());
            sendJsonResponse(['status' => 'error', 'message' => 'Failed to fetch clinic spaces.'], 500);
        }
    }
}


// --- Handle POST Request: Add a new clinic space ---
elseif ($method === 'POST') {
    $authData = getAuthenticatedUser($jwtKey, ['CLINIC_OWNER']); // Only clinic owner can add
    $ownerUserId = $authData['userId'];

    $input = json_decode(file_get_contents('php://input'), true);
    if (json_last_error() !== JSON_ERROR_NONE) {
        sendJsonResponse(['status' => 'error', 'message' => 'Invalid JSON input.'], 400);
    }

    // Get the clinic_id for the authenticated owner
    $clinicId = getClinicIdForOwner($ownerUserId, $pdo);
    if (!$clinicId) {
        sendJsonResponse(['status' => 'error', 'message' => 'No clinic found associated with this owner.'], 404);
    }

    $name = trim($input['name'] ?? '');
    $description = trim($input['description'] ?? '');
    $photos = isset($input['photos']) && is_array($input['photos']) ? json_encode(array_map('trim', $input['photos'])) : json_encode([]);
    $rentalPrice = isset($input['rentalPrice']) ? (float)$input['rentalPrice'] : 0.0;
    $rentalDuration = trim($input['rentalDuration'] ?? 'per hour');
    $rentalTerms = trim($input['rentalTerms'] ?? '');
    $features = isset($input['features']) && is_array($input['features']) ? json_encode(array_map('trim', $input['features'])) : json_encode([]);

    if (empty($name) || $rentalPrice <= 0 || empty($rentalDuration)) {
        sendJsonResponse(['status' => 'error', 'message' => 'Space name, rental price, and duration are required.'], 400);
    }

    try {
        $spaceId = 'space_' . generateUniqueId(); // From core.php

        $stmt = $pdo->prepare("INSERT INTO clinic_spaces (id, clinic_id, name, description, photos, rental_price, rental_duration, rental_terms, features) 
                               VALUES (:id, :clinic_id, :name, :description, :photos, :rental_price, :rental_duration, :rental_terms, :features)");
        
        $stmt->bindParam(':id', $spaceId);
        $stmt->bindParam(':clinic_id', $clinicId);
        $stmt->bindParam(':name', $name);
        $stmt->bindParam(':description', $description);
        $stmt->bindParam(':photos', $photos);
        $stmt->bindParam(':rental_price', $rentalPrice);
        $stmt->bindParam(':rental_duration', $rentalDuration);
        $stmt->bindParam(':rental_terms', $rentalTerms);
        $stmt->bindParam(':features', $features);

        if ($stmt->execute()) {
            // Fetch the newly created space to return it with clinicName and clinicAddress
            $newSpaceStmt = $pdo->prepare("SELECT cs.*, cd.clinic_name as clinicName, cd.address as clinicAddress 
                                           FROM clinic_spaces cs 
                                           JOIN clinics_data cd ON cs.clinic_id = cd.clinic_id 
                                           WHERE cs.id = :id");
            $newSpaceStmt->bindParam(':id', $spaceId);
            $newSpaceStmt->execute();
            $newSpace = $newSpaceStmt->fetch(PDO::FETCH_ASSOC);
            if ($newSpace) {
                if (isset($newSpace['photos'])) $newSpace['photos'] = json_decode($newSpace['photos'], true) ?: [];
                if (isset($newSpace['features'])) $newSpace['features'] = json_decode($newSpace['features'], true) ?: [];
            }
            sendJsonResponse(['status' => 'success', 'message' => 'Clinic space added successfully.', 'listing' => $newSpace], 201);
        } else {
            error_log("Failed to insert clinic space for clinic ID: " . $clinicId);
            sendJsonResponse(['status' => 'error', 'message' => 'Failed to add clinic space.'], 500);
        }
    } catch (PDOException $e) {
        error_log("Database error adding clinic space: " . $e->getMessage());
        sendJsonResponse(['status' => 'error', 'message' => 'A server error occurred while adding clinic space.'], 500);
    }
}

// --- Handle PUT Request: Update a clinic space ---
elseif ($method === 'PUT') {
    $authData = getAuthenticatedUser($jwtKey, ['CLINIC_OWNER']);
    $ownerUserId = $authData['userId'];

    $input = json_decode(file_get_contents('php://input'), true);
    if (json_last_error() !== JSON_ERROR_NONE || !isset($input['id'])) {
        sendJsonResponse(['status' => 'error', 'message' => 'Invalid JSON input or missing space ID.'], 400);
    }

    $spaceIdToUpdate = trim($input['id']);

    // Verify ownership
    $ownedClinicId = getClinicIdForOwner($ownerUserId, $pdo);
    $stmtCheckSpace = $pdo->prepare("SELECT clinic_id FROM clinic_spaces WHERE id = :id");
    $stmtCheckSpace->bindParam(':id', $spaceIdToUpdate);
    $stmtCheckSpace->execute();
    $spaceData = $stmtCheckSpace->fetch(PDO::FETCH_ASSOC);

    if (!$spaceData) {
        sendJsonResponse(['status' => 'error', 'message' => 'Space not found.'], 404);
    }
    if (!$ownedClinicId || $spaceData['clinic_id'] !== $ownedClinicId) {
        sendJsonResponse(['status' => 'error', 'message' => 'Unauthorized to update this space.'], 403);
    }

    // Prepare fields for update
    $updateFields = [];
    $params = [':id' => $spaceIdToUpdate];

    if (isset($input['name'])) { $updateFields[] = "name = :name"; $params[':name'] = trim($input['name']); }
    if (isset($input['description'])) { $updateFields[] = "description = :description"; $params[':description'] = trim($input['description']); }
    if (isset($input['photos']) && is_array($input['photos'])) { $updateFields[] = "photos = :photos"; $params[':photos'] = json_encode(array_map('trim', $input['photos'])); }
    if (isset($input['rentalPrice'])) { $updateFields[] = "rental_price = :rental_price"; $params[':rental_price'] = (float)$input['rentalPrice']; }
    if (isset($input['rentalDuration'])) { $updateFields[] = "rental_duration = :rental_duration"; $params[':rental_duration'] = trim($input['rentalDuration']); }
    if (isset($input['rentalTerms'])) { $updateFields[] = "rental_terms = :rental_terms"; $params[':rental_terms'] = trim($input['rentalTerms']); }
    if (isset($input['features']) && is_array($input['features'])) { $updateFields[] = "features = :features"; $params[':features'] = json_encode(array_map('trim', $input['features'])); }

    if (count($updateFields) === 0) {
        sendJsonResponse(['status' => 'success', 'message' => 'No changes detected for clinic space.'], 200);
    }
    
    $updateFields[] = "updated_at = NOW()";

    $sql = "UPDATE clinic_spaces SET " . implode(", ", $updateFields) . " WHERE id = :id";
    $stmtUpdate = $pdo->prepare($sql);

    try {
        if ($stmtUpdate->execute($params)) {
            // Fetch the updated space to return it
            $updatedSpaceStmt = $pdo->prepare("SELECT cs.*, cd.clinic_name as clinicName, cd.address as clinicAddress 
                                               FROM clinic_spaces cs 
                                               JOIN clinics_data cd ON cs.clinic_id = cd.clinic_id
                                               WHERE cs.id = :id");
            $updatedSpaceStmt->bindParam(':id', $spaceIdToUpdate);
            $updatedSpaceStmt->execute();
            $updatedSpace = $updatedSpaceStmt->fetch(PDO::FETCH_ASSOC);
            if ($updatedSpace) {
                if (isset($updatedSpace['photos'])) $updatedSpace['photos'] = json_decode($updatedSpace['photos'], true) ?: [];
                if (isset($updatedSpace['features'])) $updatedSpace['features'] = json_decode($updatedSpace['features'], true) ?: [];
            }
            sendJsonResponse(['status' => 'success', 'message' => 'Clinic space updated successfully.', 'listing' => $updatedSpace], 200);
        } else {
            error_log("Failed to update clinic space ID: " . $spaceIdToUpdate);
            sendJsonResponse(['status' => 'error', 'message' => 'Failed to update clinic space.'], 500);
        }
    } catch (PDOException $e) {
        error_log("Database error updating clinic space: " . $e->getMessage());
        sendJsonResponse(['status' => 'error', 'message' => 'A server error occurred while updating clinic space.'], 500);
    }
}

// --- Handle DELETE Request: Delete a clinic space ---
elseif ($method === 'DELETE') {
    $authData = getAuthenticatedUser($jwtKey, ['CLINIC_OWNER']);
    $ownerUserId = $authData['userId'];

    $input = json_decode(file_get_contents('php://input'), true);
    if (json_last_error() !== JSON_ERROR_NONE || !isset($input['listingId'])) { // Changed key to 'listingId' as per frontend
        sendJsonResponse(['status' => 'error', 'message' => 'Invalid JSON input or missing listingId.'], 400);
    }
    $listingIdToDelete = trim($input['listingId']);

    // Verify ownership
    $ownedClinicId = getClinicIdForOwner($ownerUserId, $pdo);
    $stmtCheckSpace = $pdo->prepare("SELECT clinic_id FROM clinic_spaces WHERE id = :id");
    $stmtCheckSpace->bindParam(':id', $listingIdToDelete);
    $stmtCheckSpace->execute();
    $spaceData = $stmtCheckSpace->fetch(PDO::FETCH_ASSOC);

    if (!$spaceData) {
        sendJsonResponse(['status' => 'error', 'message' => 'Space listing not found.'], 404);
    }
    if (!$ownedClinicId || $spaceData['clinic_id'] !== $ownedClinicId) {
        sendJsonResponse(['status' => 'error', 'message' => 'Unauthorized to delete this space listing.'], 403);
    }

    try {
        $stmtDelete = $pdo->prepare("DELETE FROM clinic_spaces WHERE id = :id");
        $stmtDelete->bindParam(':id', $listingIdToDelete);

        if ($stmtDelete->execute()) {
            // Note: This does not delete actual photo files from server storage.
            sendJsonResponse(['status' => 'success', 'message' => 'Clinic space listing deleted successfully.'], 200);
        } else {
            error_log("Failed to delete clinic space ID: " . $listingIdToDelete);
            sendJsonResponse(['status' => 'error', 'message' => 'Failed to delete clinic space listing.'], 500);
        }
    } catch (PDOException $e) {
        error_log("Database error deleting clinic space: " . $e->getMessage());
        sendJsonResponse(['status' => 'error', 'message' => 'A server error occurred while deleting clinic space.'], 500);
    }
}

// --- Invalid Method ---
else {
    sendJsonResponse(['status' => 'error', 'message' => 'Invalid request method for clinic spaces.'], 405);
}
?>