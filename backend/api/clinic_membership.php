<?php
// backend/api/clinic_membership.php

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

// --- Request Method Check ---
$method = strtoupper($_SERVER['REQUEST_METHOD']);
$jwtKey = defined('JWT_SECRET_KEY') ? JWT_SECRET_KEY : null;

if (!$jwtKey) {
    error_log("JWT_SECRET_KEY is not defined in core.php for clinic_membership.php");
    sendJsonResponse(['status' => 'error', 'message' => 'Server configuration error.'], 500);
}

/**
 * Helper function to get authenticated user ID and role from JWT.
 * Must be a CLINIC_OWNER for this endpoint.
 * @param string $jwtKey The JWT secret key.
 * @return array ['userId' => string, 'role' => string, 'name' => string] or exits.
 */
function getAuthenticatedClinicOwner(string $jwtKey): array {
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
        if ($decoded->data->role !== 'CLINIC_OWNER') {
            sendJsonResponse(['status' => 'error', 'message' => 'Access denied. Clinic Owner role required.'], 403);
        }
        $userName = isset($decoded->data->name) ? $decoded->data->name : 'Clinic Owner';
        return ['userId' => $decoded->data->userId, 'role' => $decoded->data->role, 'name' => $userName];
    } catch (ExpiredException $e) {
        sendJsonResponse(['status' => 'error', 'message' => 'Token has expired.'], 401);
    } catch (SignatureInvalidException $e) {
        sendJsonResponse(['status' => 'error', 'message' => 'Token signature invalid.'], 401);
    } catch (BeforeValidException $e) {
        sendJsonResponse(['status' => 'error', 'message' => 'Token not yet valid.'], 401);
    } catch (Exception $e) {
        error_log("JWT Decode Error for clinic_membership: " . $e->getMessage());
        sendJsonResponse(['status' => 'error', 'message' => 'Invalid token: ' . $e->getMessage()], 401);
    }
    exit;
}


// --- Process POST Request for Clinic Membership Application/Renewal ---
if ($method === 'POST') {
    $authData = getAuthenticatedClinicOwner($jwtKey);
    $clinicOwnerUserId = $authData['userId'];

    $input = json_decode(file_get_contents('php://input'), true);

    if (json_last_error() !== JSON_ERROR_NONE) {
        sendJsonResponse(['status' => 'error', 'message' => 'Invalid JSON input.'], 400);
    }

    $clinicId = trim($input['clinicId'] ?? ''); // Clinic's unique ID from clinics_data.clinic_id
    $paymentReceiptUrl = isset($input['paymentReceiptUrl']) ? filter_var(trim($input['paymentReceiptUrl']), FILTER_SANITIZE_URL) : null;
    $applicationDateInput = isset($input['applicationDate']) ? trim($input['applicationDate']) : date('Y-m-d H:i:s'); // Default to now
    $membershipTier = isset($input['membershipTier']) ? trim($input['membershipTier']) : (defined('STANDARD_MEMBERSHIP_TIER_NAME') ? STANDARD_MEMBERSHIP_TIER_NAME : 'Standard');


    // --- Validate Input ---
    if (empty($clinicId)) {
        sendJsonResponse(['status' => 'error', 'message' => 'Clinic ID is required.'], 400);
    }
    if (empty($paymentReceiptUrl)) {
        sendJsonResponse(['status' => 'error', 'message' => 'Payment receipt URL is required.'], 400);
    }
    if (!filter_var($paymentReceiptUrl, FILTER_VALIDATE_URL)) {
        sendJsonResponse(['status' => 'error', 'message' => 'Invalid payment receipt URL format.'], 400);
    }

    // Validate and format application date
    $applicationDateFormatted = '';
    $dt = DateTime::createFromFormat('Y-m-d H:i:s', $applicationDateInput);
    if ($dt && $dt->format('Y-m-d H:i:s') === $applicationDateInput) {
        $applicationDateFormatted = $applicationDateInput;
    } else {
        $dt = DateTime::createFromFormat(DateTime::ATOM, $applicationDateInput); // ISO 8601
        if ($dt) {
            $applicationDateFormatted = $dt->format('Y-m-d H:i:s');
        } else {
            sendJsonResponse(['status' => 'error', 'message' => 'Invalid application date format. Expected YYYY-MM-DD HH:MM:SS or ISO 8601.'], 400);
        }
    }

    try {
        // Verify the clinic owner owns this clinicId
        $stmtVerify = $pdo->prepare("SELECT user_id FROM clinics_data WHERE clinic_id = :clinic_id");
        $stmtVerify->bindParam(':clinic_id', $clinicId);
        $stmtVerify->execute();
        $clinicOwnerRecord = $stmtVerify->fetch(PDO::FETCH_ASSOC);

        if (!$clinicOwnerRecord) {
            sendJsonResponse(['status' => 'error', 'message' => 'Clinic not found.'], 404);
        }
        if ($clinicOwnerRecord['user_id'] !== $clinicOwnerUserId) {
            sendJsonResponse(['status' => 'error', 'message' => 'Unauthorized to manage this clinic\'s membership.'], 403);
        }
        
        $pdo->beginTransaction();

        // --- Update clinics_data table ---
        // Also update account_status to 'pending_approval' if it's 'draft' or 'rejected'
        $stmt = $pdo->prepare("
            UPDATE clinics_data 
            SET 
                theraway_membership_status = 'pending_approval', 
                theraway_membership_tier_name = :tier_name,
                theraway_membership_application_date = :application_date,
                theraway_membership_payment_receipt_url = :payment_receipt_url,
                account_status = CASE 
                                   WHEN account_status IN ('draft', 'rejected') THEN 'pending_approval' 
                                   ELSE account_status 
                                 END
            WHERE clinic_id = :clinic_id
        ");
        $stmt->bindParam(':tier_name', $membershipTier);
        $stmt->bindParam(':application_date', $applicationDateFormatted);
        $stmt->bindParam(':payment_receipt_url', $paymentReceiptUrl);
        $stmt->bindParam(':clinic_id', $clinicId);
        
        $stmt->execute();

        if ($stmt->rowCount() === 0) {
            // This indicates the clinic_id didn't match or no actual data changed (e.g. already pending with same receipt)
            // No error thrown here, but history log will still capture the attempt
             error_log("No rows updated in clinics_data for clinic_id: {$clinicId} during membership application. Possibly no change or ID mismatch.");
        }

        // --- Log in membership_history ---
        $historyId = 'mhist_clinic_' . generateUniqueId(); // From core.php
        $actionDescription = "Applied for {$membershipTier} Membership. Receipt: " . basename($paymentReceiptUrl);
        $membershipFee = defined('CLINIC_MEMBERSHIP_FEE') ? CLINIC_MEMBERSHIP_FEE : null;

        $detailsJson = json_encode([
            'tier' => $membershipTier,
            'receiptUrl' => $paymentReceiptUrl,
            'fee' => $membershipFee,
            'appliedByOwnerId' => $clinicOwnerUserId
        ]);

        $histStmt = $pdo->prepare("
            INSERT INTO membership_history (id, target_id, target_type, action_description, details_json, action_date)
            VALUES (:id, :target_id, 'CLINIC', :action_description, :details_json, :action_date)
        ");
        $histStmt->bindParam(':id', $historyId);
        $histStmt->bindParam(':target_id', $clinicId); // Use clinic_id as target_id
        $histStmt->bindParam(':action_description', $actionDescription);
        $histStmt->bindParam(':details_json', $detailsJson);
        $histStmt->bindParam(':action_date', $applicationDateFormatted);
        $histStmt->execute();
        
        $pdo->commit();

        // --- Fetch the updated clinic profile to return it ---
        // We need a function similar to fetchFullClinicProfileForAdmin but specific to clinic_profile.php logic
        // For now, let's assume a function `fetchFullClinicProfile($clinicId, null, $pdo)` exists or create a simplified one.
        // Re-using the structure from clinic_profile.php's fetchFullClinicProfile
        $stmtFetchUpdated = $pdo->prepare("
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
        $stmtFetchUpdated->bindParam(':clinic_id', $clinicId);
        $stmtFetchUpdated->execute();
        $updatedClinic = $stmtFetchUpdated->fetch(PDO::FETCH_ASSOC);

        if ($updatedClinic) {
            $jsonFields = ['photos', 'amenities', 'operating_hours', 'services'];
            foreach ($jsonFields as $field) {
                if (isset($updatedClinic[$field]) && $updatedClinic[$field] !== null) {
                    $decoded = json_decode($updatedClinic[$field], true);
                     $updatedClinic[$field] = is_array($decoded) ? $decoded : ($field === 'operating_hours' && is_object($decoded) ? (array)$decoded : []);
                } else {
                    $updatedClinic[$field] = ($field === 'operating_hours') ? (object)[] : [];
                }
            }
            $updatedClinic['theraWayMembership'] = [
                'status' => $updatedClinic['theraway_membership_status'] ?? 'none',
                'tierName' => $updatedClinic['theraway_membership_tier_name'],
                'renewalDate' => $updatedClinic['theraway_membership_renewal_date'],
                'applicationDate' => $updatedClinic['theraway_membership_application_date'],
                'paymentReceiptUrl' => $updatedClinic['theraway_membership_payment_receipt_url'],
            ];
            unset($updatedClinic['theraway_membership_status'], $updatedClinic['theraway_membership_tier_name'],
                  $updatedClinic['theraway_membership_renewal_date'], $updatedClinic['theraway_membership_application_date'],
                  $updatedClinic['theraway_membership_payment_receipt_url']);
            
            // Listings are not directly part of this update, so can be empty or fetched if needed.
            $updatedClinic['listings'] = []; // Placeholder for consistency with Clinic type

            sendJsonResponse(['status' => 'success', 'message' => 'Clinic membership application submitted successfully.', 'clinic' => $updatedClinic], 200);
        } else {
            error_log("Failed to fetch updated clinic profile after membership application for clinic ID: " . $clinicId);
            sendJsonResponse(['status' => 'error', 'message' => 'Application submitted, but failed to retrieve updated profile.'], 500);
        }

    } catch (PDOException $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        error_log("Database error during clinic membership application: " . $e->getMessage() . " for clinic ID: " . $clinicId);
        sendJsonResponse(['status' => 'error', 'message' => 'A server error occurred. Please try again later.'], 500);
    }

} else {
    sendJsonResponse(['status' => 'error', 'message' => 'Invalid request method. Only POST is accepted for this endpoint.'], 405);
}
?>