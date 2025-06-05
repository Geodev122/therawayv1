<?php
// backend/api/client_appointments.php

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
        error_log("JWT_SECRET_KEY is not defined in core.php for client_appointments.php");
        sendJsonResponse(['status' => 'error', 'message' => 'Server configuration error (JWT).'], 500);
    }

    /**
     * Helper function to get authenticated user ID and role from JWT.
     * @param string $jwtKey The JWT secret key.
     * @return array ['userId' => string, 'role' => string] or exits.
     */
    function getAuthenticatedClient(string $jwtKey): array {
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
            if (!isset($decoded->data) || !isset($decoded->data->userId) || !isset($decoded->data->role)) {
                sendJsonResponse(['status' => 'error', 'message' => 'Invalid token payload.'], 401);
            }
            if ($decoded->data->role !== 'CLIENT' && $decoded->data->role !== 'ADMIN') {
                sendJsonResponse(['status' => 'error', 'message' => 'Access denied. Client role required.'], 403);
            }
            return ['userId' => $decoded->data->userId, 'role' => $decoded->data->role];
        } catch (ExpiredException $e) {
            sendJsonResponse(['status' => 'error', 'message' => 'Token has expired.'], 401);
        } catch (SignatureInvalidException $e) {
            sendJsonResponse(['status' => 'error', 'message' => 'Token signature invalid.'], 401);
        } catch (BeforeValidException $e) {
            sendJsonResponse(['status' => 'error', 'message' => 'Token not yet valid.'], 401);
        } catch (Exception $e) {
            error_log("JWT Decode Error for client_appointments: " . $e->getMessage());
            sendJsonResponse(['status' => 'error', 'message' => 'Invalid token: ' . $e->getMessage()], 401);
        }
        exit;
    }

    // --- Check if appointments table exists, create if not ---
    function ensureAppointmentsTableExists(PDO $pdo): void {
        $checkTableStmt = $pdo->prepare("
            SELECT COUNT(*) 
            FROM information_schema.tables 
            WHERE table_schema = DATABASE() 
            AND table_name = 'appointments'
        ");
        $checkTableStmt->execute();
        $tableExists = (bool)$checkTableStmt->fetchColumn();

        if (!$tableExists) {
            // Create the table if it doesn't exist
            $createTableSql = "
                CREATE TABLE appointments (
                    id VARCHAR(255) NOT NULL,
                    client_id VARCHAR(255) NOT NULL,
                    therapist_id VARCHAR(255) NOT NULL,
                    appointment_date DATETIME NOT NULL,
                    duration_minutes INT NOT NULL DEFAULT 60,
                    status ENUM('scheduled', 'completed', 'cancelled', 'no_show') NOT NULL DEFAULT 'scheduled',
                    notes TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    PRIMARY KEY (id),
                    KEY client_idx (client_id),
                    KEY therapist_idx (therapist_id),
                    KEY date_idx (appointment_date),
                    CONSTRAINT fk_appointments_client FOREIGN KEY (client_id) REFERENCES users (id) ON DELETE CASCADE,
                    CONSTRAINT fk_appointments_therapist FOREIGN KEY (therapist_id) REFERENCES users (id) ON DELETE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
            ";
            $pdo->exec($createTableSql);
        }
    }

    // --- Handle GET Request: Fetch client's appointments ---
    if ($method === 'GET') {
        $authData = getAuthenticatedClient($jwtKey);
        $clientUserId = $authData['userId'];

        try {
            ensureAppointmentsTableExists($pdo);

            // Get query parameters
            $status = isset($_GET['status']) ? trim($_GET['status']) : null;
            $startDate = isset($_GET['startDate']) ? trim($_GET['startDate']) : null;
            $endDate = isset($_GET['endDate']) ? trim($_GET['endDate']) : null;

            // Build query
            $sql = "
                SELECT a.*, u.name as therapist_name, u.profile_picture_url as therapist_profile_picture_url
                FROM appointments a
                JOIN users u ON a.therapist_id = u.id
                WHERE a.client_id = :client_id
            ";
            $params = [':client_id' => $clientUserId];

            // Add filters
            if ($status && in_array($status, ['scheduled', 'completed', 'cancelled', 'no_show'])) {
                $sql .= " AND a.status = :status";
                $params[':status'] = $status;
            }
            if ($startDate) {
                $sql .= " AND a.appointment_date >= :start_date";
                $params[':start_date'] = $startDate;
            }
            if ($endDate) {
                $sql .= " AND a.appointment_date <= :end_date";
                $params[':end_date'] = $endDate;
            }

            // Order by date
            $sql .= " ORDER BY a.appointment_date DESC";

            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);
            $appointments = $stmt->fetchAll(PDO::FETCH_ASSOC);

            // Format appointments for frontend
            $formattedAppointments = [];
            foreach ($appointments as $appointment) {
                $formattedAppointments[] = [
                    'id' => $appointment['id'],
                    'clientId' => $appointment['client_id'],
                    'therapistId' => $appointment['therapist_id'],
                    'therapistName' => $appointment['therapist_name'],
                    'therapistProfilePictureUrl' => $appointment['therapist_profile_picture_url'],
                    'appointmentDate' => $appointment['appointment_date'],
                    'durationMinutes' => (int)$appointment['duration_minutes'],
                    'status' => $appointment['status'],
                    'notes' => $appointment['notes'],
                    'createdAt' => $appointment['created_at'],
                    'updatedAt' => $appointment['updated_at']
                ];
            }

            sendJsonResponse([
                'status' => 'success',
                'appointments' => $formattedAppointments
            ], 200);
        } catch (PDOException $e) {
            error_log("Database error fetching client appointments: " . $e->getMessage());
            sendJsonResponse(['status' => 'error', 'message' => 'Failed to fetch appointments.'], 500);
        }
    }

    // --- Handle POST Request: Schedule a new appointment ---
    elseif ($method === 'POST') {
        $authData = getAuthenticatedClient($jwtKey);
        $clientUserId = $authData['userId'];

        $input = json_decode(file_get_contents('php://input'), true);

        if (json_last_error() !== JSON_ERROR_NONE) {
            sendJsonResponse(['status' => 'error', 'message' => 'Invalid JSON input.'], 400);
        }

        $therapistId = trim($input['therapistId'] ?? '');
        $appointmentDate = trim($input['appointmentDate'] ?? '');
        $durationMinutes = isset($input['durationMinutes']) ? (int)$input['durationMinutes'] : 60;
        $notes = trim($input['notes'] ?? '');

        // Basic validation
        if (empty($therapistId)) {
            sendJsonResponse(['status' => 'error', 'message' => 'Therapist ID is required.'], 400);
        }
        if (empty($appointmentDate)) {
            sendJsonResponse(['status' => 'error', 'message' => 'Appointment date is required.'], 400);
        }
        if ($durationMinutes < 15 || $durationMinutes > 240) {
            sendJsonResponse(['status' => 'error', 'message' => 'Duration must be between 15 and 240 minutes.'], 400);
        }

        // Validate appointment date format and ensure it's in the future
        $appointmentDateTime = new DateTime($appointmentDate);
        $now = new DateTime();
        if ($appointmentDateTime <= $now) {
            sendJsonResponse(['status' => 'error', 'message' => 'Appointment date must be in the future.'], 400);
        }

        try {
            ensureAppointmentsTableExists($pdo);

            // Verify the therapist exists
            $verifyStmt = $pdo->prepare("
                SELECT COUNT(*) FROM users 
                WHERE id = :therapist_id AND role = 'THERAPIST'
            ");
            $verifyStmt->bindParam(':therapist_id', $therapistId);
            $verifyStmt->execute();
            
            if ($verifyStmt->fetchColumn() == 0) {
                sendJsonResponse(['status' => 'error', 'message' => 'Therapist not found.'], 404);
            }

            // Check for scheduling conflicts
            $conflictStmt = $pdo->prepare("
                SELECT COUNT(*) FROM appointments
                WHERE therapist_id = :therapist_id
                AND status = 'scheduled'
                AND (
                    (appointment_date <= :end_time AND DATE_ADD(appointment_date, INTERVAL duration_minutes MINUTE) >= :start_time)
                )
            ");
            $startTime = $appointmentDateTime->format('Y-m-d H:i:s');
            $endTime = (clone $appointmentDateTime)->modify("+{$durationMinutes} minutes")->format('Y-m-d H:i:s');
            $conflictStmt->bindParam(':therapist_id', $therapistId);
            $conflictStmt->bindParam(':start_time', $startTime);
            $conflictStmt->bindParam(':end_time', $endTime);
            $conflictStmt->execute();
            
            if ($conflictStmt->fetchColumn() > 0) {
                sendJsonResponse(['status' => 'error', 'message' => 'This time slot is already booked.'], 409);
            }

            $pdo->beginTransaction();

            // Create new appointment
            $appointmentId = 'appt_' . generateUniqueId();
            $insertStmt = $pdo->prepare("
                INSERT INTO appointments (
                    id, client_id, therapist_id, appointment_date, duration_minutes, notes
                ) VALUES (
                    :id, :client_id, :therapist_id, :appointment_date, :duration_minutes, :notes
                )
            ");
            $insertStmt->bindParam(':id', $appointmentId);
            $insertStmt->bindParam(':client_id', $clientUserId);
            $insertStmt->bindParam(':therapist_id', $therapistId);
            $insertStmt->bindParam(':appointment_date', $startTime);
            $insertStmt->bindParam(':duration_minutes', $durationMinutes);
            $insertStmt->bindParam(':notes', $notes);
            $insertStmt->execute();

            // Log the appointment scheduling in activity_logs
            $logId = 'alog_' . generateUniqueId();
            $logStmt = $pdo->prepare("
                INSERT INTO activity_logs (
                    id, timestamp, user_id, user_name, user_role, action, 
                    target_id, target_type, details
                ) VALUES (
                    :id, NOW(), :user_id, :user_name, 'CLIENT', 'SCHEDULED_APPOINTMENT', 
                    :target_id, 'therapist', :details
                )
            ");
            $logStmt->bindParam(':id', $logId);
            $logStmt->bindParam(':user_id', $clientUserId);
            $logStmt->bindParam(':user_name', $authData['name'] ?? 'Client');
            $logStmt->bindParam(':target_id', $therapistId);
            $logStmt->bindParam(':details', json_encode([
                'appointmentId' => $appointmentId,
                'appointmentDate' => $startTime,
                'durationMinutes' => $durationMinutes
            ]));
            $logStmt->execute();

            $pdo->commit();

            // Fetch the created appointment to return
            $fetchStmt = $pdo->prepare("
                SELECT a.*, u.name as therapist_name, u.profile_picture_url as therapist_profile_picture_url
                FROM appointments a
                JOIN users u ON a.therapist_id = u.id
                WHERE a.id = :appointment_id
            ");
            $fetchStmt->bindParam(':appointment_id', $appointmentId);
            $fetchStmt->execute();
            $appointment = $fetchStmt->fetch(PDO::FETCH_ASSOC);

            // Format appointment for frontend
            $formattedAppointment = [
                'id' => $appointment['id'],
                'clientId' => $appointment['client_id'],
                'therapistId' => $appointment['therapist_id'],
                'therapistName' => $appointment['therapist_name'],
                'therapistProfilePictureUrl' => $appointment['therapist_profile_picture_url'],
                'appointmentDate' => $appointment['appointment_date'],
                'durationMinutes' => (int)$appointment['duration_minutes'],
                'status' => $appointment['status'],
                'notes' => $appointment['notes'],
                'createdAt' => $appointment['created_at'],
                'updatedAt' => $appointment['updated_at']
            ];

            sendJsonResponse([
                'status' => 'success',
                'message' => 'Appointment scheduled successfully.',
                'appointment' => $formattedAppointment
            ], 201);
        } catch (PDOException $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            error_log("Database error scheduling appointment: " . $e->getMessage());
            sendJsonResponse(['status' => 'error', 'message' => 'A server error occurred while scheduling your appointment.'], 500);
        }
    }

    // --- Handle PUT Request: Update an appointment (e.g., cancel) ---
    elseif ($method === 'PUT') {
        $authData = getAuthenticatedClient($jwtKey);
        $clientUserId = $authData['userId'];

        $input = json_decode(file_get_contents('php://input'), true);

        if (json_last_error() !== JSON_ERROR_NONE || !isset($input['appointmentId'])) {
            sendJsonResponse(['status' => 'error', 'message' => 'Invalid JSON input or missing appointment ID.'], 400);
        }

        $appointmentId = trim($input['appointmentId']);
        $status = isset($input['status']) ? trim($input['status']) : null;
        $notes = isset($input['notes']) ? trim($input['notes']) : null;

        // Validate status
        if ($status && !in_array($status, ['scheduled', 'completed', 'cancelled', 'no_show'])) {
            sendJsonResponse(['status' => 'error', 'message' => 'Invalid status value.'], 400);
        }

        // Clients can only cancel appointments, not mark them as completed or no_show
        if ($status && $status !== 'cancelled') {
            sendJsonResponse(['status' => 'error', 'message' => 'Clients can only cancel appointments.'], 403);
        }

        try {
            ensureAppointmentsTableExists($pdo);

            // Verify the appointment exists and belongs to this client
            $verifyStmt = $pdo->prepare("
                SELECT a.*, u.name as therapist_name
                FROM appointments a
                JOIN users u ON a.therapist_id = u.id
                WHERE a.id = :appointment_id AND a.client_id = :client_id
            ");
            $verifyStmt->bindParam(':appointment_id', $appointmentId);
            $verifyStmt->bindParam(':client_id', $clientUserId);
            $verifyStmt->execute();
            $appointment = $verifyStmt->fetch(PDO::FETCH_ASSOC);
            
            if (!$appointment) {
                sendJsonResponse(['status' => 'error', 'message' => 'Appointment not found or you are not authorized to update it.'], 404);
            }

            // Check if appointment is already cancelled or completed
            if ($appointment['status'] !== 'scheduled') {
                sendJsonResponse(['status' => 'error', 'message' => 'Cannot update an appointment that is already ' . $appointment['status'] . '.'], 400);
            }

            // Check if appointment is in the past
            $appointmentDateTime = new DateTime($appointment['appointment_date']);
            $now = new DateTime();
            if ($appointmentDateTime <= $now) {
                sendJsonResponse(['status' => 'error', 'message' => 'Cannot update an appointment that is in the past.'], 400);
            }

            $pdo->beginTransaction();

            // Update the appointment
            $updateFields = [];
            $updateParams = [':appointment_id' => $appointmentId];

            if ($status) {
                $updateFields[] = "status = :status";
                $updateParams[':status'] = $status;
            }
            if ($notes !== null) {
                $updateFields[] = "notes = :notes";
                $updateParams[':notes'] = $notes;
            }

            if (count($updateFields) > 0) {
                $updateSql = "
                    UPDATE appointments 
                    SET " . implode(", ", $updateFields) . ", updated_at = NOW() 
                    WHERE id = :appointment_id AND client_id = :client_id
                ";
                $updateParams[':client_id'] = $clientUserId;
                
                $updateStmt = $pdo->prepare($updateSql);
                $updateStmt->execute($updateParams);
            }

            // Log the appointment update in activity_logs
            $logId = 'alog_' . generateUniqueId();
            $action = $status === 'cancelled' ? 'CANCELLED_APPOINTMENT' : 'UPDATED_APPOINTMENT';
            $logStmt = $pdo->prepare("
                INSERT INTO activity_logs (
                    id, timestamp, user_id, user_name, user_role, action, 
                    target_id, target_type, details
                ) VALUES (
                    :id, NOW(), :user_id, :user_name, 'CLIENT', :action, 
                    :target_id, 'therapist', :details
                )
            ");
            $logStmt->bindParam(':id', $logId);
            $logStmt->bindParam(':user_id', $clientUserId);
            $logStmt->bindParam(':user_name', $authData['name'] ?? 'Client');
            $logStmt->bindParam(':action', $action);
            $logStmt->bindParam(':target_id', $appointment['therapist_id']);
            $logStmt->bindParam(':details', json_encode([
                'appointmentId' => $appointmentId,
                'appointmentDate' => $appointment['appointment_date'],
                'previousStatus' => $appointment['status'],
                'newStatus' => $status,
                'therapistName' => $appointment['therapist_name']
            ]));
            $logStmt->execute();

            $pdo->commit();

            // Fetch the updated appointment to return
            $fetchStmt = $pdo->prepare("
                SELECT a.*, u.name as therapist_name, u.profile_picture_url as therapist_profile_picture_url
                FROM appointments a
                JOIN users u ON a.therapist_id = u.id
                WHERE a.id = :appointment_id
            ");
            $fetchStmt->bindParam(':appointment_id', $appointmentId);
            $fetchStmt->execute();
            $updatedAppointment = $fetchStmt->fetch(PDO::FETCH_ASSOC);

            // Format appointment for frontend
            $formattedAppointment = [
                'id' => $updatedAppointment['id'],
                'clientId' => $updatedAppointment['client_id'],
                'therapistId' => $updatedAppointment['therapist_id'],
                'therapistName' => $updatedAppointment['therapist_name'],
                'therapistProfilePictureUrl' => $updatedAppointment['therapist_profile_picture_url'],
                'appointmentDate' => $updatedAppointment['appointment_date'],
                'durationMinutes' => (int)$updatedAppointment['duration_minutes'],
                'status' => $updatedAppointment['status'],
                'notes' => $updatedAppointment['notes'],
                'createdAt' => $updatedAppointment['created_at'],
                'updatedAt' => $updatedAppointment['updated_at']
            ];

            sendJsonResponse([
                'status' => 'success',
                'message' => $status === 'cancelled' ? 'Appointment cancelled successfully.' : 'Appointment updated successfully.',
                'appointment' => $formattedAppointment
            ], 200);
        } catch (PDOException $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            error_log("Database error updating appointment: " . $e->getMessage());
            sendJsonResponse(['status' => 'error', 'message' => 'A server error occurred while updating your appointment.'], 500);
        }
    }

    // --- Invalid Method ---
    else {
        sendJsonResponse(['status' => 'error', 'message' => 'Invalid request method for client appointments.'], 405);
    }
} catch (Throwable $e) {
    // Log the error and send a clean JSON response
    error_log("Unhandled error in client_appointments.php: " . $e->getMessage());
    error_log("Stack trace: " . $e->getTraceAsString());
    sendJsonResponse(['status' => 'error', 'message' => 'An unexpected error occurred.'], 500);
}
?>