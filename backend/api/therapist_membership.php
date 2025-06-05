<?php
// backend/api/therapist_membership.php

declare(strict_types=1);
ini_set('display_errors', '0'); // Errors should be logged, not displayed in API output
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
    error_log("JWT_SECRET_KEY is not defined in core.php for therapist_membership.php");
    sendJsonResponse(['status' => 'error', 'message' => 'Server configuration error.'], 500);
}

/**
 * Helper function to get authenticated user ID and role from JWT.
 * Must be a THERAPIST for this endpoint.
 * @param string $jwtKey The JWT secret key.
 * @return array ['userId' => string, 'role' => string, 'name' => string] or exits.
 */
function getAuthenticatedTherapist(string $jwtKey): array {
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
        if ($decoded->data->role !== 'THERAPIST') {
            sendJsonResponse(['status' => 'error', 'message' => 'Access denied. Therapist role required.'], 403);
        }
        // Ensure name exists in token data, fallback if not
        $userName = isset($decoded->data->name) ? $decoded->data->name : 'Therapist User';
        return ['userId' => $decoded->data->userId, 'role' => $decoded->data->role, 'name' => $userName];
    } catch (ExpiredException $e) {
        sendJsonResponse(['status' => 'error', 'message' => 'Token has expired.'], 401);
    } catch (SignatureInvalidException $e) {
        sendJsonResponse(['status' => 'error', 'message' => 'Token signature invalid.'], 401);
    } catch (BeforeValidException $e) {
        sendJsonResponse(['status' => 'error', 'message' => 'Token not yet valid.'], 401);
    } catch (Exception $e) {
        error_log("JWT Decode Error for therapist_membership: " . $e->getMessage());
        sendJsonResponse(['status' => 'error', 'message' => 'Invalid token: ' . $e->getMessage()], 401);
    }
    exit; // Should not reach here if sendJsonResponse exits
}


// --- Process POST Request for Membership Application/Renewal ---
if ($method === 'POST') {
    $authData = getAuthenticatedTherapist($jwtKey);
    $therapistUserId = $authData['userId'];

    $input = json_decode(file_get_contents('php://input'), true);

    if (json_last_error() !== JSON_ERROR_NONE) {
        sendJsonResponse(['status' => 'error', 'message' => 'Invalid JSON input.'], 400);
    }

    $paymentReceiptUrl = isset($input['paymentReceiptUrl']) ? filter_var(trim($input['paymentReceiptUrl']), FILTER_SANITIZE_URL) : null;
    $applicationDateInput = isset($input['applicationDate']) ? trim($input['applicationDate']) : date('Y-m-d H:i:s'); // Default to now

    // --- Validate Input ---
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
        $dt = DateTime::createFromFormat(DateTime::ATOM, $applicationDateInput); // ISO 8601 like from JS new Date().toISOString()
        if ($dt) {
            $applicationDateFormatted = $dt->format('Y-m-d H:i:s');
        } else {
            // Try parsing with strtotime as a last resort for more flexibility if format is slightly off
            $timestamp = strtotime($applicationDateInput);
            if ($timestamp !== false) {
                $applicationDateFormatted = date('Y-m-d H:i:s', $timestamp);
            } else {
                sendJsonResponse(['status' => 'error', 'message' => 'Invalid application date format. Expected YYYY-MM-DD HH:MM:SS or ISO 8601.'], 400);
            }
        }
    }


    try {
        $pdo->beginTransaction();

        // --- Update therapists_data table ---
        $stmt = $pdo->prepare("
            UPDATE therapists_data 
            SET 
                account_status = 'pending_approval', 
                membership_application_date = :application_date,
                membership_payment_receipt_url = :payment_receipt_url,
                membership_status_message = 'Application submitted, awaiting admin review.'
            WHERE user_id = :user_id
        ");
        $stmt->bindParam(':application_date', $applicationDateFormatted);
        $stmt->bindParam(':payment_receipt_url', $paymentReceiptUrl);
        $stmt->bindParam(':user_id', $therapistUserId);
        
        $stmt->execute();

        if ($stmt->rowCount() === 0) {
            // Check if the therapists_data entry exists. If not, create it.
            // This is an edge case, as signup should create this row.
            $checkStmt = $pdo->prepare("SELECT user_id FROM therapists_data WHERE user_id = :user_id");
            $checkStmt->bindParam(':user_id', $therapistUserId);
            $checkStmt->execute();
            if (!$checkStmt->fetch()) {
                $insertStmt = $pdo->prepare("
                    INSERT INTO therapists_data (user_id, account_status, membership_application_date, membership_payment_receipt_url, membership_status_message)
                    VALUES (:user_id, 'pending_approval', :application_date, :payment_receipt_url, 'Application submitted, awaiting admin review.')
                ");
                $insertStmt->bindParam(':user_id', $therapistUserId);
                $insertStmt->bindParam(':application_date', $applicationDateFormatted);
                $insertStmt->bindParam(':payment_receipt_url', $paymentReceiptUrl);
                $insertStmt->execute();
                if ($insertStmt->rowCount() === 0) {
                     $pdo->rollBack();
                     error_log("Failed to insert new therapists_data row during membership application for user ID: " . $therapistUserId);
                     sendJsonResponse(['status' => 'error', 'message' => 'Failed to process membership application. Profile data missing.'], 500);
                }
            } else {
                // Row exists, but no update made (maybe data was identical or status already pending)
                error_log("Therapist data not updated for membership, possibly identical data or status for user ID: " . $therapistUserId);
            }
        }

        // --- Log in membership_history ---
        $historyId = 'mhist_ther_' . generateUniqueId(); // From core.php
        $actionDescription = "Applied for Membership. Receipt: " . basename($paymentReceiptUrl);
        $tierName = defined('STANDARD_MEMBERSHIP_TIER_NAME') ? STANDARD_MEMBERSHIP_TIER_NAME : 'Standard';
        $membershipFee = defined('THERAPIST_MEMBERSHIP_FEE') ? THERAPIST_MEMBERSHIP_FEE : null; // Example value

        $detailsJson = json_encode([
            'tier' => $tierName,
            'receiptUrl' => $paymentReceiptUrl,
            'fee' => $membershipFee,
            'appliedBy' => $therapistUserId // therapist themselves
        ]);

        $histStmt = $pdo->prepare("
            INSERT INTO membership_history (id, target_id, target_type, action_description, details_json, action_date)
            VALUES (:id, :target_id, 'THERAPIST', :action_description, :details_json, :action_date)
        ");
        $histStmt->bindParam(':id', $historyId);
        $histStmt->bindParam(':target_id', $therapistUserId); // For therapists, target_id is their user_id
        $histStmt->bindParam(':action_description', $actionDescription);
        $histStmt->bindParam(':details_json', $detailsJson);
        $histStmt->bindParam(':action_date', $applicationDateFormatted);
        $histStmt->execute();
        
        $pdo->commit();

        // --- Fetch the updated therapist profile to return it ---
        $stmtFetchUpdated = $pdo->prepare("
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
            WHERE u.id = :userId
        ");
        $stmtFetchUpdated->bindParam(':userId', $therapistUserId);
        $stmtFetchUpdated->execute();
        $updatedTherapist = $stmtFetchUpdated->fetch(PDO::FETCH_ASSOC);

        if ($updatedTherapist) {
            // Decode JSON fields for the response
           $jsonFields = ['specializations', 'languages', 'qualifications', 'locations', 'availability'];
           foreach ($jsonFields as $field) {
               if (isset($updatedTherapist[$field]) && $updatedTherapist[$field] !== null) {
                   $decoded = json_decode($updatedTherapist[$field], true);
                   $updatedTherapist[$field] = is_array($decoded) ? $decoded : [];
               } else {
                    $updatedTherapist[$field] = []; // Default to empty array if null or not set
               }
           }
           // Construct membershipApplication object for frontend compatibility
            $updatedTherapist['membershipApplication'] = [
                'date' => $updatedTherapist['membership_application_date'],
                'paymentReceiptUrl' => $updatedTherapist['membership_payment_receipt_url'],
                'statusMessage' => $updatedTherapist['membership_status_message'],
            ];
            // Clean up individual membership fields if they are now in the object
            unset($updatedTherapist['membership_application_date']);
            unset($updatedTherapist['membership_payment_receipt_url']);
            unset($updatedTherapist['membership_status_message']);

           $updatedTherapist['isVerified'] = (bool) ($updatedTherapist['is_overall_verified'] ?? false);
           unset($updatedTherapist['is_overall_verified']);

           sendJsonResponse(['status' => 'success', 'message' => 'Membership application submitted successfully.', 'therapist' => $updatedTherapist], 200);
        } else {
            error_log("Failed to fetch updated therapist profile after membership application for user ID: " . $therapistUserId);
            sendJsonResponse(['status' => 'error', 'message' => 'Application submitted, but failed to retrieve updated profile.'], 500);
        }

    } catch (PDOException $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        error_log("Database error during therapist membership application: " . $e->getMessage() . " for therapist User ID: " . $therapistUserId);
        sendJsonResponse(['status' => 'error', 'message' => 'A server error occurred. Please try again later.'], 500);
    }

} else {
    sendJsonResponse(['status' => 'error', 'message' => 'Invalid request method. Only POST is accepted for this endpoint.'], 405);
}
?>