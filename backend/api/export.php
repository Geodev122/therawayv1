<?php
// backend/api/export.php

declare(strict_types=1);
ini_set('display_errors', '0'); // Log errors, don't display directly for file downloads
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
// For file downloads, CORS might be less critical if it's a direct GET link,
// but if initiated by JS, it's still needed for preflight.
handleCors(); // From core.php

// --- Request Method & JWT Key ---
$method = strtoupper($_SERVER['REQUEST_METHOD']);
$jwtKey = defined('JWT_SECRET_KEY') ? JWT_SECRET_KEY : null;

if (!$jwtKey) {
    error_log("JWT_SECRET_KEY is not defined in core.php for export.php");
    http_response_code(500);
    echo "Server configuration error (JWT)."; // Plain text error for direct download attempt
    exit;
}

/**
 * Authenticates an admin user from JWT.
 * Echoes error and exits if authentication fails.
 * @param string $jwtKey The JWT secret key.
 * @return array Decoded JWT payload containing admin user data.
 */
function authenticateAdminForExport(string $jwtKey): array {
    if (!isset($_SERVER['HTTP_AUTHORIZATION'])) {
        http_response_code(401); echo "Authorization header missing."; exit;
    }
    $authHeader = $_SERVER['HTTP_AUTHORIZATION'];
    list($type, $token) = explode(' ', $authHeader, 2);

    if (strcasecmp($type, 'Bearer') !== 0 || empty($token)) {
        http_response_code(401); echo "Invalid token type or token is empty."; exit;
    }

    try {
        $decoded = JWT::decode($token, new Key($jwtKey, 'HS256'));
        if (!isset($decoded->data) || !isset($decoded->data->role) || $decoded->data->role !== 'ADMIN' || !isset($decoded->data->userId)) {
            http_response_code(403); echo "Access denied. Admin role required."; exit;
        }
        return (array)$decoded->data;
    } catch (Exception $e) { // Catch all JWT exceptions
        error_log("JWT Decode Error for export: " . $e->getMessage());
        http_response_code(401); echo "Invalid token: " . $e->getMessage(); exit;
    }
}

// --- Handle GET Request: Export data ---
if ($method === 'GET') {
    $adminData = authenticateAdminForExport($jwtKey);

    $exportType = $_GET['type'] ?? null;
    $filtersParam = $_GET['filters'] ?? '{}'; // Expect URL-encoded JSON string
    $filters = json_decode(urldecode($filtersParam), true);
    if (json_last_error() !== JSON_ERROR_NONE) {
        $filters = []; // Default to no filters if JSON is invalid
    }

    if (empty($exportType) || !in_array($exportType, ['therapists', 'clinics', 'inquiries', 'logs'])) {
        http_response_code(400);
        echo "Invalid export type specified. Allowed types: therapists, clinics, inquiries, logs.";
        exit;
    }

    $filename = "theraway_export_{$exportType}_" . date('Y-m-d_H-i-s') . ".csv";
    
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="' . $filename . '"');

    $output = fopen('php://output', 'w'); // Output directly to the browser

    try {
        $pdo->setAttribute(PDO::ATTR_EMULATE_PREPARES, false); // Ensure native prepared statements

        if ($exportType === 'therapists') {
            fputcsv($output, [
                'User ID', 'Name', 'Email', 'Account Status', 'Is Verified', 'WhatsApp', 'Bio', 
                'Specializations', 'Languages', 'Qualifications', 'Locations', 
                'Rating', 'Review Count', 'Profile Views', 'Likes Count', 
                'Membership App Date', 'Membership Receipt URL', 'Membership Status Msg', 'Membership Renewal Date',
                'Admin Notes', 'Created At', 'Updated At'
            ]);
            $sql = "SELECT u.id, u.name, u.email, td.* 
                    FROM users u 
                    JOIN therapists_data td ON u.id = td.user_id 
                    WHERE u.role = 'THERAPIST'";
            // Apply filters (basic example for status and search term)
            $params = [];
            if (!empty($filters['status'])) { $sql .= " AND td.account_status = :status"; $params[':status'] = $filters['status']; }
            if (!empty($filters['searchTerm'])) { $sql .= " AND (u.name LIKE :searchTerm OR u.email LIKE :searchTerm)"; $params[':searchTerm'] = "%{$filters['searchTerm']}%"; }
            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);
            while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
                fputcsv($output, [
                    $row['id'], $row['name'], $row['email'], $row['account_status'], $row['is_overall_verified'] ? 'Yes' : 'No',
                    $row['whatsapp_number'], $row['bio'], 
                    $row['specializations'], $row['languages'], $row['qualifications'], $row['locations'], // These are JSON strings
                    $row['rating'], $row['review_count'], $row['profile_views'], $row['likes_count'],
                    $row['membership_application_date'], $row['membership_payment_receipt_url'], $row['membership_status_message'], $row['membership_renewal_date'],
                    $row['admin_notes'], $row['created_at'], $row['updated_at']
                ]);
            }
        } elseif ($exportType === 'clinics') {
            fputcsv($output, [
                'Clinic ID', 'Clinic Name', 'Owner User ID', 'Owner Name', 'Owner Email', 
                'Account Status', 'Is Verified', 'Description', 'Address', 'WhatsApp',
                'Amenities', 'Operating Hours', 'Services', 'Photos URLs',
                'Membership Status', 'Membership Tier', 'Membership App Date', 'Membership Renewal Date',
                'Admin Notes', 'Created At', 'Updated At'
            ]);
            $sql = "SELECT cd.*, u.name as owner_name, u.email as owner_email 
                    FROM clinics_data cd 
                    JOIN users u ON cd.user_id = u.id 
                    WHERE u.role = 'CLINIC_OWNER'";
            $params = [];
            if (!empty($filters['status'])) { $sql .= " AND cd.account_status = :status"; $params[':status'] = $filters['status']; }
            if (!empty($filters['searchTerm'])) { $sql .= " AND (cd.clinic_name LIKE :searchTerm OR u.name LIKE :searchTerm OR u.email LIKE :searchTerm)"; $params[':searchTerm'] = "%{$filters['searchTerm']}%"; }
            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);
            while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
                fputcsv($output, [
                    $row['clinic_id'], $row['clinic_name'], $row['user_id'], $row['owner_name'], $row['owner_email'],
                    $row['account_status'], $row['is_verified_by_admin'] ? 'Yes' : 'No',
                    $row['description'], $row['address'], $row['whatsapp_number'],
                    $row['amenities'], $row['operating_hours'], $row['services'], $row['clinic_photos'], // JSON strings
                    $row['theraway_membership_status'], $row['theraway_membership_tier_name'], $row['theraway_membership_application_date'], $row['theraway_membership_renewal_date'],
                    $row['admin_notes'], $row['created_at'], $row['updated_at']
                ]);
            }
        } elseif ($exportType === 'inquiries') {
            fputcsv($output, ['Inquiry ID', 'User ID', 'User Name', 'User Email', 'Subject', 'Message', 'Date', 'Status', 'Priority', 'Category', 'Admin Reply']);
            $sql = "SELECT * FROM user_inquiries";
            $params = [];
            if (!empty($filters['status'])) { $sql .= " WHERE status = :status"; $params[':status'] = $filters['status']; }
            // Add more filters as needed for inquiries
            $sql .= " ORDER BY date DESC";
            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);
            while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
                fputcsv($output, $row);
            }
        } elseif ($exportType === 'logs') {
            fputcsv($output, ['Log ID', 'Timestamp', 'User ID', 'User Name', 'User Role', 'Action', 'Target ID', 'Target Type', 'Details']);
            $sql = "SELECT * FROM activity_logs";
            $params = [];
            if (!empty($filters['action'])) { $sql .= " WHERE action LIKE :action"; $params[':action'] = "%{$filters['action']}%"; }
            if (!empty($filters['user'])) { 
                $sql .= (strpos($sql, 'WHERE') === false ? " WHERE" : " AND") . " (user_id LIKE :user OR user_name LIKE :user)"; 
                $params[':user'] = "%{$filters['user']}%"; 
            }
             // Add more filters as needed for logs
            $sql .= " ORDER BY timestamp DESC";
            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);
            while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
                fputcsv($output, $row);
            }
        }

        fclose($output);

    } catch (PDOException $e) {
        error_log("Database error during export of {$exportType}: " . $e->getMessage());
        http_response_code(500);
        // Don't echo sensitive error to user if output has started
        if (ftell($output) === 0) { // Check if anything has been written to output yet
            echo "A server error occurred during data export.";
        }
    }
    exit;

}

// --- Invalid Method ---
else {
    http_response_code(405);
    echo "Invalid request method. Only GET is accepted for export.";
    exit;
}
?>







