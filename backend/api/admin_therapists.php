<?php
// backend/api/admin_therapists.php

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

if (!$jwtKey) {
    error_log("JWT_SECRET_KEY is not defined in core.php for admin_therapists.php");
    sendJsonResponse(['status' => 'error', 'message' => 'Server configuration error (JWT).'], 500);
}

/**
 * Authenticates an admin user from JWT.
 * Sends error response and exits if authentication fails.
 * @param string $jwtKey The JWT secret key.
 * @return array Decoded JWT payload containing user data (including admin's userId and name).
 */
function authenticateAdmin(string $jwtKey): array {
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
        if (!isset($decoded->data) || !isset($decoded->data->role) || $decoded->data->role !== 'ADMIN' || !isset($decoded->data->userId)) {
            sendJsonResponse(['status' => 'error', 'message' => 'Access denied. Admin role required.'], 403);
        }
        // Ensure admin name is available, fallback if not
        $adminName = isset($decoded->data->name) ? $decoded->data->name : 'Admin User';
        return ['userId' => $decoded->data->userId, 'role' => $decoded->data->role, 'name' => $adminName];
    } catch (ExpiredException $e) {
        sendJsonResponse(['status' => 'error', 'message' => 'Token has expired.'], 401);
    } catch (SignatureInvalidException $e) {
        sendJsonResponse(['status' => 'error', 'message' => 'Token signature invalid.'], 401);
    } catch (BeforeValidException $e) {
        sendJsonResponse(['status' => 'error', 'message' => 'Token not yet valid.'], 401);
    } catch (Exception $e) {
        error_log("JWT Decode Error for admin_therapists: " . $e->getMessage());
        sendJsonResponse(['status' => 'error', 'message' => 'Invalid token: ' . $e->getMessage()], 401);
    }
    exit; // Should not reach here
}

/**
 * Fetches the full therapist profile details for admin view.
 * @param string $userId The therapist's user ID.
 * @param PDO $pdo The PDO database connection object.
 * @return array|null The therapist profile or null if not found.
 */
function fetchFullTherapistProfileForAdmin(string $userId, PDO $pdo): ?array {
    // This function is similar to the one in therapist_profile.php but might include more admin-specific fields if needed
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
        LEFT JOIN therapists_data td ON u.id = td.user_id -- Use LEFT JOIN in case therapists_data is not yet populated
        WHERE u.id = :userId AND u.role = 'THERAPIST'
    ");
    $stmt->bindParam(':userId', $userId);
    $stmt->execute();
    $therapist = $stmt->fetch(PDO::FETCH_ASSOC);

    if ($therapist) {
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
        // Fetch certifications
        $certStmt = $pdo->prepare("SELECT id, name, file_url, country, is_verified_by_admin, verification_notes, uploaded_at FROM certifications WHERE therapist_user_id = :userId ORDER BY uploaded_at DESC");
        $certStmt->bindParam(':userId', $userId);
        $certStmt->execute();
        $therapist['certifications'] = $certStmt->fetchAll(PDO::FETCH_ASSOC);
        
        // Construct membershipApplication object
        $therapist['membershipApplication'] = [
            'date' => $therapist['membership_application_date'],
            'paymentReceiptUrl' => $therapist['membership_payment_receipt_url'],
            'statusMessage' => $therapist['membership_status_message'],
        ];
        unset($therapist['membership_application_date'], $therapist['membership_payment_receipt_url'], $therapist['membership_status_message']);
        
        $therapist['isVerified'] = (bool) ($therapist['is_overall_verified'] ?? false); // Match frontend type
        unset($therapist['is_overall_verified']);
    }
    return $therapist;
}


// --- Handle GET Request: Fetch list of therapists ---
if ($method === 'GET') {
    $adminData = authenticateAdmin($jwtKey);

    // Pagination and filtering parameters
    $page = isset($_GET['page']) ? max(1, (int)$_GET['page']) : 1;
    $limit = isset($_GET['limit']) ? max(1, min(100, (int)$_GET['limit'])) : 20; // Max 100 per page
    $offset = ($page - 1) * $limit;
    
    $statusFilter = isset($_GET['status']) ? trim($_GET['status']) : null;
    $searchTerm = isset($_GET['searchTerm']) ? trim($_GET['searchTerm']) : null;

    $whereClauses = ["u.role = 'THERAPIST'"]; // Always filter for therapists
    $params = [];

    if ($statusFilter && in_array($statusFilter, ['draft', 'pending_approval', 'live', 'rejected'])) {
        $whereClauses[] = "td.account_status = :status";
        $params[':status'] = $statusFilter;
    }
    if ($searchTerm) {
        $whereClauses[] = "(u.name LIKE :searchTerm OR u.email LIKE :searchTerm)";
        $params[':searchTerm'] = "%{$searchTerm}%";
    }

    $sqlWhere = count($whereClauses) > 0 ? " WHERE " . implode(" AND ", $whereClauses) : "";
    $sqlOrder = " ORDER BY u.created_at DESC"; // Newest first

    try {
        // Count total items for pagination
        $countSql = "SELECT COUNT(u.id) FROM users u LEFT JOIN therapists_data td ON u.id = td.user_id" . $sqlWhere;
        $countStmt = $pdo->prepare($countSql);
        $countStmt->execute($params);
        $totalItems = (int)$countStmt->fetchColumn();
        $totalPages = ceil($totalItems / $limit);

        // Fetch therapists for the current page
        $mainSql = "
            SELECT 
                u.id, u.name, u.email, u.profile_picture_url,
                td.bio, td.whatsapp_number, td.intro_video_url, td.account_status,
                td.admin_notes, td.membership_application_date, td.membership_payment_receipt_url,
                td.membership_status_message, td.membership_renewal_date,
                td.specializations, td.languages, td.qualifications, td.locations,
                td.rating, td.review_count, td.profile_views, td.likes_count,
                td.is_overall_verified, td.availability, u.role -- Include role for safety, though filtered
            FROM users u
            LEFT JOIN therapists_data td ON u.id = td.user_id
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

        $therapists = [];
        foreach ($therapistsRaw as $therapistEntry) {
            // Ensure therapists_data fields exist, provide defaults if not (e.g., for a user just set to THERAPIST role)
            $therapistEntry['account_status'] = $therapistEntry['account_status'] ?? 'draft';
            $therapistEntry['is_overall_verified'] = $therapistEntry['is_overall_verified'] ?? false;

            $jsonFields = ['specializations', 'languages', 'qualifications', 'locations', 'availability'];
            foreach ($jsonFields as $field) {
                if (isset($therapistEntry[$field]) && $therapistEntry[$field] !== null) {
                    $decoded = json_decode($therapistEntry[$field], true);
                    $therapistEntry[$field] = is_array($decoded) ? $decoded : [];
                } else {
                    $therapistEntry[$field] = [];
                }
            }
             // Construct membershipApplication object
            $therapistEntry['membershipApplication'] = [
                'date' => $therapistEntry['membership_application_date'],
                'paymentReceiptUrl' => $therapistEntry['membership_payment_receipt_url'],
                'statusMessage' => $therapistEntry['membership_status_message'],
            ];
            unset($therapistEntry['membership_application_date'], $therapistEntry['membership_payment_receipt_url'], $therapistEntry['membership_status_message']);
            
            $therapistEntry['isVerified'] = (bool) $therapistEntry['is_overall_verified'];
            unset($therapistEntry['is_overall_verified']);

            // For admin listing, certifications might not be needed directly, or fetched on demand
            // For now, we're not fetching certifications for each therapist in the list to keep it lighter.
            // If needed, you'd loop and query certifications table here.
            $therapistEntry['certifications'] = []; // Placeholder

            $therapists[] = $therapistEntry;
        }

        sendJsonResponse([
            'status' => 'success',
            'data' => $therapists, // Key 'data' to match AdminDashboardPage.tsx
            'pagination' => [
                'currentPage' => $page,
                'totalPages' => $totalPages,
                'totalItems' => $totalItems,
                'itemsPerPage' => $limit
            ]
        ], 200);

    } catch (PDOException $e) {
        error_log("Database error fetching therapists for admin: " . $e->getMessage());
        sendJsonResponse(['status' => 'error', 'message' => 'Failed to fetch therapist data.'], 500);
    }
}

// --- Handle PUT Request: Update therapist status/notes ---
elseif ($method === 'PUT') {
    $adminData = authenticateAdmin($jwtKey);
    $adminPerformingActionId = $adminData['userId'];
    $adminPerformingActionName = $adminData['name'];

    $input = json_decode(file_get_contents('php://input'), true);

    if (json_last_error() !== JSON_ERROR_NONE || !isset($input['id'])) {
        sendJsonResponse(['status' => 'error', 'message' => 'Invalid JSON input or missing therapist ID.'], 400);
    }

    $therapistUserId = trim($input['id']);
    $newStatus = isset($input['status']) ? trim($input['status']) : null;
    $adminNotes = isset($input['adminNotes']) ? trim($input['adminNotes']) : null; // Allow empty string to clear notes
    $isOverallVerifiedInput = $input['isOverallVerified'] ?? null; // Boolean expected

    if (empty($therapistUserId)) {
        sendJsonResponse(['status' => 'error', 'message' => 'Therapist user ID is required.'], 400);
    }
    if ($newStatus && !in_array($newStatus, ['draft', 'pending_approval', 'live', 'rejected'])) {
        sendJsonResponse(['status' => 'error', 'message' => 'Invalid account status provided.'], 400);
    }

    try {
        // Fetch current therapist_data to check existing status if only notes are updated
        $stmtFetchCurrent = $pdo->prepare("SELECT account_status, membership_payment_receipt_url FROM therapists_data WHERE user_id = :user_id");
        $stmtFetchCurrent->bindParam(':user_id', $therapistUserId);
        $stmtFetchCurrent->execute();
        $currentTherapistData = $stmtFetchCurrent->fetch(PDO::FETCH_ASSOC);

        if (!$currentTherapistData) {
             // If therapists_data does not exist, it implies the user might exist but not their specific therapist data.
             // This can happen if a user's role was changed to THERAPIST but the therapists_data row was not created.
             // Admins should be able to create this row if they are setting status/notes.
            $stmtInsertTherapistData = $pdo->prepare("INSERT INTO therapists_data (user_id, account_status, admin_notes, is_overall_verified) VALUES (:user_id, :account_status, :admin_notes, :is_overall_verified)");
            $defaultStatusForNew = $newStatus ?? 'draft';
            $defaultVerifiedForNew = $isOverallVerifiedInput === null ? false : (bool)$isOverallVerifiedInput;
            $stmtInsertTherapistData->execute([
                ':user_id' => $therapistUserId,
                ':account_status' => $defaultStatusForNew,
                ':admin_notes' => $adminNotes,
                ':is_overall_verified' => $defaultVerifiedForNew
            ]);
            if ($stmtInsertTherapistData->rowCount() === 0) {
                sendJsonResponse(['status' => 'error', 'message' => 'Failed to initialize therapist data. User might not exist or role incorrect.'], 404);
            }
            // After insert, re-fetch to ensure consistency for logging/response
            $stmtFetchCurrent->execute();
            $currentTherapistData = $stmtFetchCurrent->fetch(PDO::FETCH_ASSOC);
            if (!$currentTherapistData) { // Should not happen if insert was successful
                sendJsonResponse(['status' => 'error', 'message' => 'Critical error after therapist data initialization.'], 500);
            }
        }
        
        $currentStatus = $currentTherapistData['account_status'];
        $statusToLog = $newStatus ?? $currentStatus; // Use new status if provided, else current

        $updateFields = [];
        $params = [':user_id' => $therapistUserId];

        if ($newStatus !== null) { $updateFields[] = "account_status = :status"; $params[':status'] = $newStatus; }
        if ($adminNotes !== null) { $updateFields[] = "admin_notes = :admin_notes"; $params[':admin_notes'] = $adminNotes; }
        if ($isOverallVerifiedInput !== null) {
            $updateFields[] = "is_overall_verified = :is_overall_verified";
            $params[':is_overall_verified'] = (bool)$isOverallVerifiedInput;
        }
        
        if (count($updateFields) === 0) {
            sendJsonResponse(['status' => 'success', 'message' => 'No changes detected for therapist.', 'therapist' => fetchFullTherapistProfileForAdmin($therapistUserId, $pdo)], 200);
        }
        
        $updateFields[] = "updated_at = NOW()"; // Always update this

        $sql = "UPDATE therapists_data SET " . implode(", ", $updateFields) . " WHERE user_id = :user_id";
        $stmtUpdate = $pdo->prepare($sql);

        $pdo->beginTransaction();
        if ($stmtUpdate->execute($params)) {
            // Log membership status change if status was actually changed to live or rejected
            if ($newStatus && ($newStatus === 'live' || $newStatus === 'rejected') && $newStatus !== $currentStatus) {
                $historyId = 'mhist_ther_' . generateUniqueId();
                $actionDescription = "Membership " . ($newStatus === 'live' ? "Approved" : "Rejected") . " by Admin.";
                $logDetails = [
                    'previousStatus' => $currentStatus,
                    'newStatus' => $newStatus,
                    'adminUserId' => $adminPerformingActionId,
                    'adminName' => $adminPerformingActionName,
                    'notes' => $adminNotes
                ];
                 if ($newStatus === 'live') {
                    // Set renewal date if not already set (e.g., 1 year from approval)
                    $updateRenewalStmt = $pdo->prepare("UPDATE therapists_data SET membership_renewal_date = DATE_ADD(NOW(), INTERVAL 1 YEAR) WHERE user_id = :user_id AND membership_renewal_date IS NULL");
                    $updateRenewalStmt->execute([':user_id' => $therapistUserId]);
                }

                $histStmt = $pdo->prepare("
                    INSERT INTO membership_history (id, target_id, target_type, action_description, details_json, action_date)
                    VALUES (:id, :target_id, 'THERAPIST', :action_description, :details_json, NOW())
                ");
                $histStmt->execute([
                    ':id' => $historyId,
                    ':target_id' => $therapistUserId,
                    ':action_description' => $actionDescription,
                    ':details_json' => json_encode($logDetails)
                ]);
            }
            $pdo->commit();
            $updatedTherapistProfile = fetchFullTherapistProfileForAdmin($therapistUserId, $pdo);
            sendJsonResponse(['status' => 'success', 'message' => 'Therapist profile updated successfully.', 'therapist' => $updatedTherapistProfile], 200);
        } else {
            $pdo->rollBack();
            error_log("Failed to update therapist_data for user ID: " . $therapistUserId);
            sendJsonResponse(['status' => 'error', 'message' => 'Failed to update therapist data.'], 500);
        }

    } catch (PDOException $e) {
        if($pdo->inTransaction()) $pdo->rollBack();
        error_log("Database error updating therapist for admin: " . $e->getMessage());
        sendJsonResponse(['status' => 'error', 'message' => 'A server error occurred while updating therapist data.'], 500);
    }
}

// --- Invalid Method ---
else {
    sendJsonResponse(['status' => 'error', 'message' => 'Invalid request method for admin/therapists.'], 405);
}
?>