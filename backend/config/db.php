<?php
// backend/config/db.php

// --- Database Configuration ---
// Replace with your actual database credentials from Hostinger
$db_host = '127.0.0.1';         // Often 'localhost' or a specific IP provided by Hostinger. 127.0.0.1 is standard for localhost.
$db_port = '3306';              // Default MySQL port
$db_name = 'u660679266_gentheraway'; // Your Hostinger database name
$db_user = 'u660679266_geo';     // Your Hostinger database username
$db_pass = '@Geopsyme1234';       // Your Hostinger database password
$db_charset = 'utf8mb4';

// --- Data Source Name (DSN) for PDO ---
$dsn = "mysql:host={$db_host};port={$db_port};dbname={$db_name};charset={$db_charset}";

// --- PDO Options ---
$options = [
    PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION, // Throw exceptions on errors
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,       // Fetch associative arrays
    PDO::ATTR_EMULATE_PREPARES   => false,                  // Use native prepared statements
];

// --- PDO Connection ---
try {
    $pdo = new PDO($dsn, $db_user, $db_pass, $options);
} catch (PDOException $e) {
    // In a production environment, you might want to log this error to a file
    // and show a more generic error message to the user.
    // For development, displaying the error is fine.
    error_log("Database Connection Error: " . $e->getMessage());

    // If this db.php is included in an API script, it's good practice
    // to stop execution and return a JSON error.
    // Check if headers have already been sent to avoid errors.
    if (!headers_sent()) {
        header('Content-Type: application/json');
        http_response_code(500); // Internal Server Error
        echo json_encode([
            'status' => 'error',
            'message' => 'Database connection failed. Please try again later or contact support.'
            // 'debug_message' => $e->getMessage() // Uncomment for development debugging ONLY
        ]);
    }
    exit; // Stop script execution
}

// The $pdo variable is now available for use in scripts that include this file.
?>