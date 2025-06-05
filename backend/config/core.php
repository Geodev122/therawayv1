<?php
// backend/config/core.php

declare(strict_types=1);

// --- Environment Configuration ---
// Set to 'development' or 'production'.
// In a real setup, this might be determined by an environment variable.
// This affects error reporting and potentially other settings.
if (!defined('ENVIRONMENT')) {
    define('ENVIRONMENT', 'development'); // CHANGE TO 'production' FOR YOUR LIVE SITE
}

// --- Error Reporting ---
if (ENVIRONMENT === 'development') {
    error_reporting(E_ALL);
    ini_set('display_errors', '1'); // Display errors directly in development
} else {
    error_reporting(E_ALL);      // Log all errors in production
    ini_set('display_errors', '0'); // Don't display errors to users
    ini_set('log_errors', '1');     // Log errors to the server's error log
    // For production, you might want to set a custom error log path:
    // Ensure this path is writable by the web server.
    // ini_set('error_log', __DIR__ . '/../../php_error.log'); // Example: path outside web root
}

// --- Default Timezone ---
// Set this to your server's or application's primary timezone. UTC is a good default.
date_default_timezone_set('UTC'); // Example: 'Asia/Dubai', 'America/New_York'

// --- JWT Configuration ---
// !!! CRITICAL SECURITY !!!
// REPLACE 'YOUR_VERY_STRONG_SECRET_RANDOM_KEY_GOES_HERE_REPLACE_ME_NOW'
// WITH A VERY STRONG, RANDOM, AND SECRET KEY.
// Generate one using: echo base64_encode(random_bytes(64));
// This key should ideally be loaded from an environment variable and NOT hardcoded directly
// in version control for production systems.
if (!defined('JWT_SECRET_KEY')) {
    define('JWT_SECRET_KEY', 'YOUR_VERY_STRONG_SECRET_RANDOM_KEY_GOES_HERE_REPLACE_ME_NOW');
}
if (!defined('JWT_ISSUER')) {
    define('JWT_ISSUER', 'theraway.net'); // The issuer of the token (your domain)
}
if (!defined('JWT_AUDIENCE')) {
    define('JWT_AUDIENCE', 'theraway.net'); // The audience of the token (your domain)
}
if (!defined('JWT_ALGORITHM')) {
    define('JWT_ALGORITHM', 'HS256'); // Algorithm used for JWT
}
if (!defined('JWT_EXPIRATION_TIME_SECONDS')) {
    define('JWT_EXPIRATION_TIME_SECONDS', 60 * 60 * 24 * 7); // Token valid for 7 days (seconds)
}


// --- CORS Configuration ---
// Define allowed origins for Cross-Origin Resource Sharing.
// For production, restrict this to your actual frontend domain(s).
$default_allowed_origins = [
    'http://localhost:5173', // Vite dev server (React frontend for /app/)
    'http://localhost:3000', // Common React dev port
    'http://theraway.net',   // Your production domain (for splash screen if served over HTTP)
    'https://theraway.net'   // Your production domain (for app and splash screen over HTTPS)
    // Add any other specific origins if necessary
];
if (!defined('ALLOWED_ORIGINS')) {
    define('ALLOWED_ORIGINS', $default_allowed_origins);
}

// --- File Upload Configuration ---
// Physical server path to the 'backend' directory
if (!defined('BACKEND_BASE_PATH')) {
    define('BACKEND_BASE_PATH', dirname(__DIR__)); // Assumes core.php is in /backend/config/
}
// Physical server path to the main 'uploads' directory (inside 'backend')
if (!defined('BASE_UPLOAD_PATH')) {
    define('BASE_UPLOAD_PATH', BACKEND_BASE_PATH . '/uploads');
}
// Web accessible base URL for uploads (relative to domain root)
// Example: if your domain maps to public_html and backend is inside it (public_html/backend/),
// then this would be '/backend/uploads'. Adjust if your structure differs.
if (!defined('BASE_UPLOAD_URL')) {
    define('BASE_UPLOAD_URL', '/backend/uploads');
}

// Specific subdirectory names (these will be appended to BASE_UPLOAD_PATH and BASE_UPLOAD_URL)
$upload_subdirectories = [
    'PROFILE_PICTURES' => 'profile_pictures',
    'INTRO_VIDEOS'     => 'intro_videos',
    'CERTIFICATIONS'   => 'certifications',
    'CLINIC_PHOTOS'    => 'clinic_photos',
    'SPACE_PHOTOS'     => 'space_photos',
    'PAYMENT_RECEIPTS' => 'payment_receipts'
];

foreach ($upload_subdirectories as $const_prefix => $dir_name) {
    if (!defined($const_prefix . '_DIR_NAME')) {
        define($const_prefix . '_DIR_NAME', $dir_name);
    }
    // Construct full physical paths for saving files
    if (!defined($const_prefix . '_PATH')) {
        define($const_prefix . '_PATH', BASE_UPLOAD_PATH . '/' . $dir_name);
    }
    // Construct full web URLs for accessing files
    if (!defined($const_prefix . '_URL')) {
        define($const_prefix . '_URL', BASE_UPLOAD_URL . '/' . $dir_name);
    }
}

// --- Include Helper Functions ---
// This file (helpers.php) should contain sendJsonResponse, generateUniqueId,
// getAuthenticatedUser, authenticateAdmin, fetchFullTherapistProfile, etc.
// It's crucial this path is correct.
require_once BACKEND_BASE_PATH . '/core/helpers.php';


// --- CORS Handling Function Definition ---
// This function uses constants defined above and helper functions (like sendJsonResponse).
// It should be defined after helpers.php is included if it uses sendJsonResponse for OPTIONS.
if (!function_exists('handleCors')) {
    function handleCors(): void {
        $requestOrigin = $_SERVER['HTTP_ORIGIN'] ?? '';
        $allowedOriginsConstant = defined('ALLOWED_ORIGINS') ? ALLOWED_ORIGINS : [];

        // Ensure ALLOWED_ORIGINS is an array
        $allowedOriginsList = is_array($allowedOriginsConstant) ? $allowedOriginsConstant : [];

        if (!empty($requestOrigin)) { // Origin header is present
            if (in_array($requestOrigin, $allowedOriginsList) || (!empty($allowedOriginsList) && $allowedOriginsList[0] === '*')) {
                header("Access-Control-Allow-Origin: {$requestOrigin}");
                header('Access-Control-Allow-Credentials: true');
            }
            // If origin is not in the list and '*' is not explicitly set, no CORS header is sent for origin, effectively denying.
        } elseif (!empty($allowedOriginsList) && $allowedOriginsList[0] === '*') {
             // If no Origin header, but '*' is allowed (e.g. server-to-server, or some non-browser clients)
             header("Access-Control-Allow-Origin: *");
        }


        header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, PATCH, OPTIONS');
        // Common headers your frontend might send
        header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With, Accept');
        // Max age for preflight OPTIONS requests (e.g., 1 day)
        header('Access-Control-Max-Age: 86400');

        // Handle HTTP OPTIONS method (preflight request)
        if (strtoupper($_SERVER['REQUEST_METHOD']) == 'OPTIONS') {
            // For OPTIONS, we just need to send back the CORS headers and a 204 No Content.
            // sendJsonResponse from helpers.php would send a JSON body, which is not typical for OPTIONS.
            http_response_code(204); // No Content
            exit;
        }
    }
}

// --- Create Upload Directories if they don't exist ---
// This attempts to create the directories on script inclusion.
// Permissions must be correctly set on the parent 'uploads' or 'backend' directory
// for PHP to be able to create subdirectories.
$upload_dirs_to_create = [
    BASE_UPLOAD_PATH, // The main uploads directory
    PROFILE_PICTURES_PATH,
    INTRO_VIDEOS_PATH,
    CERTIFICATIONS_PATH,
    CLINIC_PHOTOS_PATH,
    SPACE_PHOTOS_PATH,
    PAYMENT_RECEIPTS_PATH
];

foreach ($upload_dirs_to_create as $dir) {
    if (!is_dir($dir)) {
        // Attempt to create the directory recursively.
        // 0755 permissions: owner rwx, group rx, other rx.
        // Use @ to suppress errors if directory creation fails (errors will be logged by error_reporting).
        if (!@mkdir($dir, 0755, true) && !is_dir($dir)) { // Re-check if dir exists after mkdir attempt
            // Log error if directory creation failed and it still doesn't exist.
            // This won't stop script execution here, but upload scripts should handle this failure more gracefully.
            error_log("Failed to create upload directory in core.php: {$dir}. Check permissions.");
        }
    }
}

// --- Optional: Define constants for membership tiers/fees if not already defined by other means ---
if (!defined('STANDARD_MEMBERSHIP_TIER_NAME')) {
    define('STANDARD_MEMBERSHIP_TIER_NAME', "Standard Membership");
}
if (!defined('THERAPIST_MEMBERSHIP_FEE')) {
    define('THERAPIST_MEMBERSHIP_FEE', 4.00); // Example fee
}
if (!defined('CLINIC_MEMBERSHIP_FEE')) {
    define('CLINIC_MEMBERSHIP_FEE', 8.00); // Example fee
}

?>