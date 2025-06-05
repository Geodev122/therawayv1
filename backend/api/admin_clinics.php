<?php
// backend/api/admin_clinics.php

declare(strict_types=1);
ini_set('display_errors', '0'); // Log errors, don't display in API output
error_reporting(E_ALL);

try { // Global try-catch block to handle any unhandled errors
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
        error_log("JWT_SECRET_KEY is not defined in core.php for admin_clinics.php");
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
        if (!str_contains($authHeader, ' ')) {
            sendJsonResponse(['status' => 'error', 'message' => 'Invalid Authorization header format.'], 401);
        }
        list($type, $token) = explode(' ', $authHeader, 2);

        if (strcasecmp($type, 'Bearer') !== 0 || empty($token)) {
            sendJsonResponse(['status' => 'error', 'message' => 'Invalid token type or token is empty.'], 401);
        }

        try {
            $decoded = JWT::decode($token, new Key($jwtKey, 'HS256'));
            if (!isset($decoded->data) || !isset($decoded->data->role) || $decoded->data->role !== 'ADMIN' || !isset($decoded->data->userId)) {
                sendJsonResponse(['status' => 'error', 'message' => 'Access denied. Admin role required.'], 403);
            }
            $adminName = isset($decoded->data->name) ? $decoded->data->name : 'Admin User';
            return ['userId' => $decoded->data->userId, 'role' => $decoded->data->role, 'name' => $adminName];
        } catch (ExpiredException $e) {
            sendJsonResponse(['status' => 'error', 'message' => 'Token has expired.'], 401);
        } catch (SignatureInvalidException $e) {
            sendJsonResponse(['status' => 'error', 'message' => 'Token signature invalid.'], 401);
        } catch (BeforeValidException $e) {
            sendJsonResponse(['status' => 'error', 'message' => 'Token not yet valid.'], 401);
        } catch (Exception $e) {
            error_log("JWT Decode Error for admin_clinics: " . $e->getMessage());
            sendJsonResponse(['status' => 'error', 'message' => 'Invalid token: ' . $e->getMessage()], 401);
        }
    }

    /**
     * Fetches the full clinic profile details for admin view.
     * @param string $clinic_id The clinic's unique ID (from clinics_data.clinic_id).
     * @param PDO $pdo The PDO database connection object.
     * @return array|null The clinic profile or null if not found.
     */
    function fetchFullClinicProfileForAdmin(string $clinic_id, PDO $pdo): ?array {
        $stmt = $pdo->prepare("
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
            WHERE cd.clinic_id = :clinic_id AND u.role = 'CLINIC_OWNER'
        ");
        $stmt->bindParam(':clinic_id', $clinic_id);
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
            // Clinic spaces are usually fetched separately for detailed view, not needed for admin list item
            $clinic['listings'] = []; // Placeholder, can be fetched if admin needs to see listings here.
        }
        return $clinic;
    }


    // --- Handle GET Request: Fetch list of clinics ---
    if ($method === 'GET') {
        $adminData = authenticateAdmin($jwtKey);

        $page = isset($_GET['page']) ? max(1, (int)$_GET['page']) : 1;
        $limit = isset($_GET['limit']) ? max(1, min(100, (int)$_GET['limit'])) : 20;
        $offset = ($page - 1) * $limit;
        
        $statusFilter = isset($_GET['status']) ? trim($_GET['status']) : null;
        $searchTerm = isset($_GET['searchTerm']) ? trim($_GET['searchTerm']) : null;

        $whereClauses = ["u.role = 'CLINIC_OWNER'"]; // Base filter
        $params = [];

        if ($statusFilter && in_array($statusFilter, ['draft', 'pending_approval', 'live', 'rejected'])) {
            $whereClauses[] = "cd.account_status = :status";
            $params[':status'] = $statusFilter;
        }
        if ($searchTerm) {
            $whereClauses[] = "(cd.clinic_name LIKE :searchTerm OR u.email LIKE :searchTerm OR u.name LIKE :searchTerm OR cd.clinic_id LIKE :searchTerm)";
            $params[':searchTerm'] = "%{$searchTerm}%";
        }

        $sqlWhere = count($whereClauses) > 0 ? " WHERE " . implode(" AND ", $whereClauses) : "";
        $sqlOrder = " ORDER BY cd.created_at DESC";

        try {
            $countSql = "SELECT COUNT(cd.clinic_id) FROM clinics_data cd JOIN users u ON cd.user_id = u.id" . $sqlWhere;
            $countStmt = $pdo->prepare($countSql);
            $countStmt->execute($params);
            $totalItems = (int)$countStmt->fetchColumn();
            $totalPages = ceil($totalItems / $limit);

            $mainSql = "
                SELECT 
                    cd.clinic_id as id, 
                    cd.user_id as ownerId, 
                    cd.clinic_name as name, 
                    cd.description, cd.address, cd.latitude, cd.longitude, 
                    cd.clinic_profile_picture_url as profilePictureUrl, 
                    cd.clinic_photos as photos, 
                    cd.amenities, cd.operating_hours, cd.services,
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
                    u.email as ownerEmail,
                    u.role -- For verification
                FROM clinics_data cd
                JOIN users u ON cd.user_id = u.id
                " . $sqlWhere . $sqlOrder . " LIMIT :limit OFFSET :offset";
            
            $stmt = $pdo->prepare($mainSql);
            foreach ($params as $key => $value) {
                $stmt->bindValue($key, $value);
            }
            $stmt->bindParam(':limit', $limit, PDO::PARAM_INT);
            $stmt->bindParam(':offset', $offset, PDO::PARAM_INT);
            $stmt->execute();
            $clinicsRaw = $stmt->fetchAll(PDO::FETCH_ASSOC);

            $clinics = [];
            foreach ($clinicsRaw as $clinicEntry) {
                $clinicEntry['accountStatus'] = $clinicEntry['accountStatus'] ?? 'draft';
                $clinicEntry['isVerified'] = (bool) ($clinicEntry['isVerified'] ?? false);
                
                $jsonFields = ['photos', 'amenities', 'operating_hours', 'services'];
                foreach ($jsonFields as $field) {
                    if (isset($clinicEntry[$field]) && $clinicEntry[$field] !== null) {
                        $decoded = json_decode($clinicEntry[$field], true);
                        $clinicEntry[$field] = is_array($decoded) ? $decoded : ($field === 'operating_hours' && is_object($decoded) ? (array)$decoded : []);
                    } else {
                        $clinicEntry[$field] = ($field === 'operating_hours') ? (object)[] : [];
                    }
                }
                // Construct theraWayMembership object
                $clinicEntry['theraWayMembership'] = [
                    'status' => $clinicEntry['theraway_membership_status'] ?? 'none',
                    'tierName' => $clinicEntry['theraway_membership_tier_name'],
                    'renewalDate' => $clinicEntry['theraway_membership_renewal_date'],
                    'applicationDate' => $clinicEntry['theraway_membership_application_date'],
                    'paymentReceiptUrl' => $clinicEntry['theraway_membership_payment_receipt_url'],
                ];
                unset(
                    $clinicEntry['theraway_membership_status'], $clinicEntry['theraway_membership_tier_name'],
                    $clinicEntry['theraway_membership_renewal_date'], $clinicEntry['theraway_membership_application_date'],
                    $clinicEntry['theraway_membership_payment_receipt_url']
                );
                // Listings are not fetched for the admin list view of clinics for performance.
                $clinicEntry['listings'] = []; 
                $clinics[] = $clinicEntry;
            }

            sendJsonResponse([
                'status' => 'success',
                'data' => $clinics, // Key 'data' to match AdminDashboardPage.tsx
                'pagination' => [
                    'currentPage' => $page,
                    'totalPages' => $totalPages,
                    'totalItems' => $totalItems,
                    'itemsPerPage' => $limit
                ]
            ], 200);

        } catch (PDOException $e) {
            error_log("Database error fetching clinics for admin: " . $e->getMessage());
            sendJsonResponse(['status' => 'error', 'message' => 'Failed to fetch clinic data.'], 500);
        }
    }

    // --- Handle PUT Request: Update clinic status/notes ---
    elseif ($method === 'PUT') {
        $adminData = authenticateAdmin($jwtKey);
        $adminPerformingActionId = $adminData['userId'];
        $adminPerformingActionName = $adminData['name'];

        $input = json_decode(file_get_contents('php://input'), true);

        if (json_last_error() !== JSON_ERROR_NONE || !isset($input['id'])) { // id here is clinic_id
            sendJsonResponse(['status' => 'error', 'message' => 'Invalid JSON input or missing clinic ID.'], 400);
        }

        $clinicIdToUpdate = trim($input['id']);
        $newStatus = isset($input['status']) ? trim($input['status']) : null;
        $adminNotes = isset($input['adminNotes']) ? trim($input['adminNotes']) : null;
        $isVerifiedByAdminInput = $input['isVerified'] ?? null; // From frontend type

        if (empty($clinicIdToUpdate)) {
            sendJsonResponse(['status' => 'error', 'message' => 'Clinic ID is required.'], 400);
        }
        if ($newStatus && !in_array($newStatus, ['draft', 'pending_approval', 'live', 'rejected'])) {
            sendJsonResponse(['status' => 'error', 'message' => 'Invalid account status provided.'], 400);
        }

        try {
            $stmtFetchCurrent = $pdo->prepare("SELECT account_status FROM clinics_data WHERE clinic_id = :clinic_id");
            $stmtFetchCurrent->bindParam(':clinic_id', $clinicIdToUpdate);
            $stmtFetchCurrent->execute();
            $currentClinicData = $stmtFetchCurrent->fetch(PDO::FETCH_ASSOC);

            if (!$currentClinicData) {
                sendJsonResponse(['status' => 'error', 'message' => 'Clinic not found.'], 404);
            }
            
            $currentStatus = $currentClinicData['account_status'];
            $statusToLog = $newStatus ?? $currentStatus;

            $updateFields = [];
            $params = [':clinic_id' => $clinicIdToUpdate];

            if ($newStatus !== null) { $updateFields[] = "account_status = :status"; $params[':status'] = $newStatus; }
            if ($adminNotes !== null) { $updateFields[] = "admin_notes = :admin_notes"; $params[':admin_notes'] = $adminNotes; }
            if ($isVerifiedByAdminInput !== null) {
                $updateFields[] = "is_verified_by_admin = :is_verified_by_admin";
                $params[':is_verified_by_admin'] = (bool)$isVerifiedByAdminInput;
            }
            
            if (count($updateFields) === 0) {
                sendJsonResponse(['status' => 'success', 'message' => 'No changes detected for clinic.', 'clinic' => fetchFullClinicProfileForAdmin($clinicIdToUpdate, $pdo)], 200);
            }
            
            $updateFields[] = "updated_at = NOW()"; // Always update this

            $sql = "UPDATE clinics_data SET " . implode(", ", $updateFields) . " WHERE clinic_id = :clinic_id";
            $stmtUpdate = $pdo->prepare($sql);

            $pdo->beginTransaction();
            if ($stmtUpdate->execute($params)) {
                if ($newStatus && ($newStatus === 'live' || $newStatus === 'rejected') && $newStatus !== $currentStatus) {
                    $historyId = 'mhist_clinic_' . generateUniqueId();
                    $actionDescription = "Clinic Membership " . ($newStatus === 'live' ? "Approved" : "Rejected") . " by Admin.";
                    $logDetails = [
                        'previousStatus' => $currentStatus,
                        'newStatus' => $newStatus,
                        'adminUserId' => $adminPerformingActionId,
                        'adminName' => $adminPerformingActionName,
                        'notes' => $adminNotes
                    ];
                    if ($newStatus === 'live') {
                        // Set renewal date if not already set (e.g., 1 year from approval)
                        // Also update theraway_membership_status to 'active'
                        $updateMembershipStmt = $pdo->prepare("UPDATE clinics_data SET theraway_membership_renewal_date = DATE_ADD(NOW(), INTERVAL 1 YEAR), theraway_membership_status = 'active' WHERE clinic_id = :clinic_id AND theraway_membership_renewal_date IS NULL");
                        $updateMembershipStmt->execute([':clinic_id' => $clinicIdToUpdate]);
                    }

                    $histStmt = $pdo->prepare("
                        INSERT INTO membership_history (id, target_id, target_type, action_description, details_json, action_date)
                        VALUES (:id, :target_id, 'CLINIC', :action_description, :details_json, NOW())
                    ");
                    $histStmt->execute([
                        ':id' => $historyId,
                        ':target_id' => $clinicIdToUpdate,
                        ':action_description' => $actionDescription,
                        ':details_json' => json_encode($logDetails)
                    ]);
                }
                $pdo->commit();
                $updatedClinicProfile = fetchFullClinicProfileForAdmin($clinicIdToUpdate, $pdo);
                sendJsonResponse(['status' => 'success', 'message' => 'Clinic profile updated successfully.', 'clinic' => $updatedClinicProfile], 200);
            } else {
                $pdo->rollBack();
                error_log("Failed to update clinics_data for clinic ID: " . $clinicIdToUpdate);
                sendJsonResponse(['status' => 'error', 'message' => 'Failed to update clinic data.'], 500);
            }

        } catch (PDOException $e) {
            if($pdo->inTransaction()) $pdo->rollBack();
            error_log("Database error updating clinic for admin: " . $e->getMessage());
            sendJsonResponse(['status' => 'error', 'message' => 'A server error occurred while updating clinic data.'], 500);
        }
    }

    // --- Invalid Method ---
    else {
        sendJsonResponse(['status' => 'error', 'message' => 'Invalid request method for admin/clinics.'], 405);
    }
} catch (Throwable $e) {
    // Log the error and send a clean JSON response
    error_log("Unhandled error in admin_clinics.php: " . $e->getMessage());
    error_log("Stack trace: " . $e->getTraceAsString());
    sendJsonResponse(['status' => 'error', 'message' => 'An unexpected error occurred.'], 500);
}
?>