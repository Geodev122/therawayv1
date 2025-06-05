<?php
// backend/tools/php_compatibility_check.php
// A tool to check PHP files for common compatibility issues

declare(strict_types=1);
ini_set('display_errors', '1');
error_reporting(E_ALL);

// Define the directory to scan
$baseDir = __DIR__ . '/..';
$apiDir = $baseDir . '/api';

// Function to check a PHP file for common issues
function checkPhpFile($filePath) {
    $issues = [];
    $content = file_get_contents($filePath);
    
    if ($content === false) {
        return ["Could not read file: $filePath"];
    }
    
    // Check for proper error handling
    if (!preg_match('/try\s*{/i', $content)) {
        $issues[] = "Missing try/catch blocks for error handling";
    }
    
    // Check for proper content type headers
    if (strpos($content, 'sendJsonResponse') !== false && 
        !preg_match('/header\s*\(\s*[\'"]Content-Type:\s*application\/json/i', $content)) {
        $issues[] = "May be missing explicit Content-Type header for JSON responses";
    }
    
    // Check for proper input validation
    if (strpos($content, 'file_get_contents(\'php://input\')') !== false && 
        !preg_match('/json_last_error\s*\(\s*\)/i', $content)) {
        $issues[] = "JSON input validation may be incomplete";
    }
    
    // Check for SQL injection vulnerabilities
    if (preg_match('/\$pdo->query\s*\(\s*[\'"].*\$[a-zA-Z0-9_]+/i', $content)) {
        $issues[] = "Potential SQL injection vulnerability: direct variable in query";
    }
    
    // Check for proper transaction handling
    if (strpos($content, '$pdo->beginTransaction') !== false && 
        !preg_match('/\$pdo->rollBack/i', $content)) {
        $issues[] = "Transaction started but rollBack may be missing";
    }
    
    // Check for proper CORS handling
    if (!preg_match('/handleCors\s*\(\s*\)/i', $content)) {
        $issues[] = "CORS handling may be missing";
    }
    
    // Check for proper JWT validation
    if (strpos($content, 'JWT') !== false && 
        !preg_match('/try\s*{.*JWT::decode/is', $content)) {
        $issues[] = "JWT decoding may not be properly wrapped in try/catch";
    }
    
    return $issues;
}

// Function to scan a directory for PHP files
function scanDirectory($dir) {
    $results = [];
    $files = scandir($dir);
    
    foreach ($files as $file) {
        if ($file === '.' || $file === '..') continue;
        
        $path = $dir . '/' . $file;
        
        if (is_dir($path)) {
            $results = array_merge($results, scanDirectory($path));
        } else if (pathinfo($path, PATHINFO_EXTENSION) === 'php') {
            $issues = checkPhpFile($path);
            if (!empty($issues)) {
                $results[$path] = $issues;
            }
        }
    }
    
    return $results;
}

// Scan the API directory
$apiIssues = scanDirectory($apiDir);

// Output the results
echo "<h1>PHP Compatibility Check Results</h1>";

if (empty($apiIssues)) {
    echo "<p>No issues found in API files.</p>";
} else {
    echo "<h2>Issues Found:</h2>";
    echo "<ul>";
    foreach ($apiIssues as $file => $issues) {
        $relativeFile = str_replace($baseDir, '', $file);
        echo "<li><strong>$relativeFile</strong><ul>";
        foreach ($issues as $issue) {
            echo "<li>$issue</li>";
        }
        echo "</ul></li>";
    }
    echo "</ul>";
}

// Provide recommendations
echo "<h2>General Recommendations:</h2>";
echo "<ol>";
echo "<li><strong>Error Handling:</strong> Wrap all code in try/catch blocks to ensure proper error handling.</li>";
echo "<li><strong>Input Validation:</strong> Always validate and sanitize all input data.</li>";
echo "<li><strong>Database Queries:</strong> Use prepared statements for all database queries.</li>";
echo "<li><strong>Transaction Management:</strong> Ensure all transactions have proper rollback handling.</li>";
echo "<li><strong>CORS Handling:</strong> Call handleCors() at the beginning of each API file.</li>";
echo "<li><strong>JWT Validation:</strong> Properly validate JWT tokens and handle all potential exceptions.</li>";
echo "<li><strong>Response Formatting:</strong> Always use sendJsonResponse() for consistent API responses.</li>";
echo "<li><strong>Global Error Handling:</strong> Wrap the entire file in a try/catch to catch unexpected errors.</li>";
echo "</ol>";

echo "<h2>Template for New API Files:</h2>";
echo "<pre>";
echo htmlspecialchars('<?php
// backend/api/example_endpoint.php

declare(strict_types=1);
ini_set(\'display_errors\', \'0\'); // Log errors, don\'t display in API output
error_reporting(E_ALL);

// --- Includes ---
try {
    require_once __DIR__ . \'/../config/core.php\';
    require_once __DIR__ . \'/../config/db.php\'; // Provides $pdo
    require_once __DIR__ . \'/../vendor/autoload.php\'; // Composer autoloader

    // --- CORS Handling ---
    handleCors(); // From core.php

    // --- Request Method & JWT Key ---
    $method = strtoupper($_SERVER[\'REQUEST_METHOD\']);
    $jwtKey = defined(\'JWT_SECRET_KEY\') ? JWT_SECRET_KEY : null;

    if (!$jwtKey) {
        error_log("JWT_SECRET_KEY is not defined in core.php for example_endpoint.php");
        sendJsonResponse([\'status\' => \'error\', \'message\' => \'Server configuration error (JWT).\'], 500);
    }

    // --- Authentication Check (if needed) ---
    try {
        $authData = getAuthenticatedUser($jwtKey, [\'ROLE1\', \'ROLE2\']);
        $userId = $authData[\'userId\'];
    } catch (Exception $e) {
        error_log("Authentication error in example_endpoint.php: " . $e->getMessage());
        sendJsonResponse([\'status\' => \'error\', \'message\' => \'Authentication failed: \' . $e->getMessage()], 401);
    }

    // --- Process GET Request ---
    if ($method === \'GET\') {
        try {
            // Your GET logic here
            
            sendJsonResponse([
                \'status\' => \'success\',
                \'data\' => $yourData
            ]);
            
        } catch (PDOException $e) {
            error_log("Database error in GET example_endpoint.php: " . $e->getMessage());
            sendJsonResponse([
                \'status\' => \'error\',
                \'message\' => \'Database error occurred.\'
            ], 500);
        } catch (Exception $e) {
            error_log("Error in GET example_endpoint.php: " . $e->getMessage());
            sendJsonResponse([
                \'status\' => \'error\',
                \'message\' => \'An error occurred while processing your request.\'
            ], 500);
        }
    }
    // --- Process POST Request ---
    elseif ($method === \'POST\') {
        try {
            $input = json_decode(file_get_contents(\'php://input\'), true);
            
            if (json_last_error() !== JSON_ERROR_NONE) {
                sendJsonResponse([\'status\' => \'error\', \'message\' => \'Invalid JSON input.\'], 400);
            }
            
            // Input validation
            if (!isset($input[\'requiredField\']) || empty($input[\'requiredField\'])) {
                sendJsonResponse([\'status\' => \'error\', \'message\' => \'Required field is missing.\'], 400);
            }
            
            // Database operations
            $pdo->beginTransaction();
            
            try {
                // Your database operations here
                
                $pdo->commit();
                
                sendJsonResponse([
                    \'status\' => \'success\',
                    \'message\' => \'Operation completed successfully.\',
                    \'data\' => $resultData
                ]);
                
            } catch (PDOException $e) {
                $pdo->rollBack();
                throw $e; // Re-throw to be caught by outer catch
            }
            
        } catch (PDOException $e) {
            error_log("Database error in POST example_endpoint.php: " . $e->getMessage());
            sendJsonResponse([
                \'status\' => \'error\',
                \'message\' => \'Database error occurred.\'
            ], 500);
        } catch (Exception $e) {
            error_log("Error in POST example_endpoint.php: " . $e->getMessage());
            sendJsonResponse([
                \'status\' => \'error\',
                \'message\' => \'An error occurred while processing your request.\'
            ], 500);
        }
    }
    // --- Invalid Method ---
    else {
        sendJsonResponse([
            \'status\' => \'error\',
            \'message\' => \'Method not allowed. Only GET and POST are accepted for this endpoint.\'
        ], 405);
    }
} catch (Throwable $e) {
    // Global error handler to ensure we always return a valid JSON response
    error_log("Unexpected error in example_endpoint.php: " . $e->getMessage());
    sendJsonResponse([
        \'status\' => \'error\',
        \'message\' => \'An unexpected error occurred. Please try again later.\'
    ], 500);
}
?>');
echo "</pre>";
?>
