<?php
// backend/api/upload.php

declare(strict_types=1);
ini_set('display_errors', '0');
error_reporting(E_ALL);

require_once __DIR__ . '/../config/core.php';
require_once __DIR__ . '/../config/db.php'; // $pdo might not be used here, but good for consistency
require_once __DIR__ . '/../vendor/autoload.php';

use Firebase\JWT\JWT;
use Firebase\JWT\Key;
use Firebase\JWT\ExpiredException;
use Firebase\JWT\SignatureInvalidException;
use Firebase\JWT\BeforeValidException;

handleCors(); // From core.php

$method = strtoupper($_SERVER['REQUEST_METHOD']);
$jwtKey = defined('JWT_SECRET_KEY') ? JWT_SECRET_KEY : null;

if (!$jwtKey) {
    error_log("JWT_SECRET_KEY is not defined in core.php for upload.php");
    sendJsonResponse(['status' => 'error', 'message' => 'Server configuration error (JWT).'], 500);
}

/**
 * Helper function to get authenticated user ID from JWT.
 * Sends error response and exits if authentication fails.
 * @return string User ID or exits.
 */
function getAuthenticatedUserId(string $jwtKey): string {
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
        if (!isset($decoded->data) || !isset($decoded->data->userId)) {
            sendJsonResponse(['status' => 'error', 'message' => 'Invalid token payload.'], 401);
        }
        return $decoded->data->userId;
    } catch (ExpiredException $e) {
        sendJsonResponse(['status' => 'error', 'message' => 'Token has expired.'], 401);
    } catch (SignatureInvalidException $e) {
        sendJsonResponse(['status' => 'error', 'message' => 'Token signature invalid.'], 401);
    } catch (BeforeValidException $e) {
        sendJsonResponse(['status' => 'error', 'message' => 'Token not yet valid.'], 401);
    } catch (Exception $e) {
        error_log("JWT Decode Error for upload: " . $e->getMessage());
        sendJsonResponse(['status' => 'error', 'message' => 'Invalid token: ' . $e->getMessage()], 401);
    }
    exit; // Should not reach here
}


if ($method !== 'POST') {
    sendJsonResponse(['status' => 'error', 'message' => 'Invalid request method. Only POST is accepted.'], 405);
}

// Authenticate user for all uploads
$userId = getAuthenticatedUserId($jwtKey);

// Get uploadType from POST data (not $_FILES key initially)
$uploadType = $_POST['uploadType'] ?? null;
// The actual file is expected in $_FILES with a key that matches $uploadType
// For example, if $_POST['uploadType'] is 'profilePicture', then look for $_FILES['profilePicture']

if (empty($uploadType)) {
    sendJsonResponse(['status' => 'error', 'message' => 'uploadType parameter is missing.'], 400);
}

// Check if the file key exists in $_FILES based on $uploadType
if (!isset($_FILES[$uploadType]) || !is_uploaded_file($_FILES[$uploadType]['tmp_name'])) {
    sendJsonResponse(['status' => 'error', 'message' => "No file uploaded or invalid file field name. Expected file under key '{$uploadType}'."], 400);
}

$file = $_FILES[$uploadType];

// Define configurations for different upload types
$uploadConfigs = [
    'profilePicture' => [
        'targetPath' => defined('PROFILE_PICTURES_PATH') ? PROFILE_PICTURES_PATH : null,
        'targetUrlBase' => defined('PROFILE_PICTURES_URL') ? PROFILE_PICTURES_URL : null,
        'allowedMimes' => ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
        'maxSizeMB' => defined('PROFILE_PICTURE_MAX_SIZE_MB') ? PROFILE_PICTURE_MAX_SIZE_MB : 2,
    ],
    'introVideo' => [
        'targetPath' => defined('INTRO_VIDEOS_PATH') ? INTRO_VIDEOS_PATH : null,
        'targetUrlBase' => defined('INTRO_VIDEOS_URL') ? INTRO_VIDEOS_URL : null,
        'allowedMimes' => ['video/mp4', 'video/webm', 'video/quicktime'],
        'maxSizeMB' => defined('VIDEO_MAX_SIZE_MB') ? VIDEO_MAX_SIZE_MB : 10,
    ],
    'certificationFile' => [ // Generic name for certification file uploads
        'targetPath' => defined('CERTIFICATIONS_PATH') ? CERTIFICATIONS_PATH : null,
        'targetUrlBase' => defined('CERTIFICATIONS_URL') ? CERTIFICATIONS_URL : null,
        'allowedMimes' => ['application/pdf', 'image/jpeg', 'image/png'],
        'maxSizeMB' => defined('CERTIFICATION_MAX_SIZE_MB') ? CERTIFICATION_MAX_SIZE_MB : 5,
    ],
    'clinicProfilePicture' => [ // For the main clinic profile picture
        'targetPath' => defined('CLINIC_PHOTOS_PATH') ? CLINIC_PHOTOS_PATH : null,
        'targetUrlBase' => defined('CLINIC_PHOTOS_URL') ? CLINIC_PHOTOS_URL : null,
        'allowedMimes' => ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
        'maxSizeMB' => defined('PROFILE_PICTURE_MAX_SIZE_MB') ? PROFILE_PICTURE_MAX_SIZE_MB : 2, // Usually same as user profile pic
    ],
    'clinicPhoto' => [ // For additional clinic gallery photos
        'targetPath' => defined('CLINIC_PHOTOS_PATH') ? CLINIC_PHOTOS_PATH : null,
        'targetUrlBase' => defined('CLINIC_PHOTOS_URL') ? CLINIC_PHOTOS_URL : null,
        'allowedMimes' => ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
        'maxSizeMB' => defined('CLINIC_PHOTO_MAX_SIZE_MB') ? CLINIC_PHOTO_MAX_SIZE_MB : 5,
    ],
    'spacePhoto' => [ // For clinic space photos
        'targetPath' => defined('SPACE_PHOTOS_PATH') ? SPACE_PHOTOS_PATH : null,
        'targetUrlBase' => defined('SPACE_PHOTOS_URL') ? SPACE_PHOTOS_URL : null,
        'allowedMimes' => ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
        'maxSizeMB' => defined('CLINIC_SPACE_PHOTO_MAX_SIZE_MB') ? CLINIC_SPACE_PHOTO_MAX_SIZE_MB : 3,
    ],
    'paymentReceipt' => [
        'targetPath' => defined('PAYMENT_RECEIPTS_PATH') ? PAYMENT_RECEIPTS_PATH : null,
        'targetUrlBase' => defined('PAYMENT_RECEIPTS_URL') ? PAYMENT_RECEIPTS_URL : null,
        'allowedMimes' => ['application/pdf', 'image/jpeg', 'image/png'],
        'maxSizeMB' => defined('PAYMENT_RECEIPT_MAX_SIZE_MB') ? PAYMENT_RECEIPT_MAX_SIZE_MB : 2,
    ]
    // Add more types as needed, e.g., spacePhoto_0, spacePhoto_1 if needed
    // Or handle multiple files for spacePhoto in frontend and send one by one.
];

// Handle dynamic uploadTypes for certifications (e.g., certification_certId_timestamp)
if (strpos($uploadType, 'certification_') === 0) {
    $configKey = 'certificationFile';
} else {
    $configKey = $uploadType;
}


if (!isset($uploadConfigs[$configKey])) {
    sendJsonResponse(['status' => 'error', 'message' => "Invalid uploadType: '{$uploadType}'."], 400);
}

$config = $uploadConfigs[$configKey];

// Ensure paths are defined in core.php
if (!$config['targetPath'] || !$config['targetUrlBase']) {
     error_log("Upload targetPath or targetUrlBase not defined in core.php for uploadType: {$uploadType}");
     sendJsonResponse(['status' => 'error', 'message' => 'Server configuration error (upload paths).'], 500);
}


// --- File Validation ---
if ($file['error'] !== UPLOAD_ERR_OK) {
    $phpUploadErrors = [
        UPLOAD_ERR_INI_SIZE => 'The uploaded file exceeds the upload_max_filesize directive in php.ini.',
        UPLOAD_ERR_FORM_SIZE => 'The uploaded file exceeds the MAX_FILE_SIZE directive that was specified in the HTML form.',
        UPLOAD_ERR_PARTIAL => 'The uploaded file was only partially uploaded.',
        UPLOAD_ERR_NO_FILE => 'No file was uploaded.',
        UPLOAD_ERR_NO_TMP_DIR => 'Missing a temporary folder.',
        UPLOAD_ERR_CANT_WRITE => 'Failed to write file to disk.',
        UPLOAD_ERR_EXTENSION => 'A PHP extension stopped the file upload.',
    ];
    $errorMessage = $phpUploadErrors[$file['error']] ?? 'Unknown upload error.';
    sendJsonResponse(['status' => 'error', 'message' => $errorMessage], 400);
}

// Validate file size
$maxSizeBytes = $config['maxSizeMB'] * 1024 * 1024;
if ($file['size'] > $maxSizeBytes) {
    sendJsonResponse(['status' => 'error', 'message' => "File is too large. Maximum size is {$config['maxSizeMB']}MB."], 400);
}

// Validate MIME type
$fileMimeType = mime_content_type($file['tmp_name']);
if (!in_array($fileMimeType, $config['allowedMimes'])) {
    sendJsonResponse(['status' => 'error', 'message' => "Invalid file type '{$fileMimeType}'. Allowed types: " . implode(', ', $config['allowedMimes']) . "."], 400);
}

// --- Generate Unique Filename and Path ---
$fileExtension = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
if (empty($fileExtension)) { // Try to get extension from MIME if original name has none
    $mimeToExt = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/gif' => 'gif', 'image/webp' => 'webp', 'video/mp4' => 'mp4', 'video/webm' => 'webm', 'application/pdf' => 'pdf'];
    $fileExtension = $mimeToExt[$fileMimeType] ?? 'dat';
}

$uniqueFilename = $userId . '_' . $uploadType . '_' . generateUniqueId() . '.' . $fileExtension; // From core.php
$destinationPath = rtrim($config['targetPath'], '/') . '/' . $uniqueFilename;
$fileUrl = rtrim($config['targetUrlBase'], '/') . '/' . $uniqueFilename;

// --- Ensure Target Directory Exists (core.php should do this, but double check for safety) ---
$targetDir = dirname($destinationPath);
if (!is_dir($targetDir)) {
    if (!mkdir($targetDir, 0755, true) && !is_dir($targetDir)) { // Recursive creation
        error_log("Failed to create target directory for upload: {$targetDir}");
        sendJsonResponse(['status' => 'error', 'message' => 'Server error: Could not create upload directory.'], 500);
    }
}

// --- Move Uploaded File ---
if (move_uploaded_file($file['tmp_name'], $destinationPath)) {
    sendJsonResponse([
        'status' => 'success',
        'message' => 'File uploaded successfully.',
        'fileUrl' => $fileUrl,
        'fileName' => $uniqueFilename // Optional: if frontend needs it
    ], 201); // Created
} else {
    error_log("Failed to move uploaded file. Source: {$file['tmp_name']}, Dest: {$destinationPath}, Type: {$uploadType}");
    sendJsonResponse(['status' => 'error', 'message' => 'Failed to save uploaded file.'], 500);
}
?>