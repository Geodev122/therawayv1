<?php
// backend/core/User.php

declare(strict_types=1);

class UserEntity // Renamed to UserEntity to avoid conflict with your User type in types.ts if used in same context
{
    public string $id;
    public string $name;
    public string $email;
    public string $role; // Should match UserRole enum values
    public ?string $profilePictureUrl;
    public string $createdAt;
    public string $updatedAt;
    public ?string $socialProvider; // Added for social login tracking
    // password_hash is sensitive and typically not a public property of a User object sent to client
    // private string $passwordHash;

    public function __construct(
        string $id,
        string $name,
        string $email,
        string $role,
        ?string $profilePictureUrl = null,
        ?string $socialProvider = null,
        string $createdAt = '', // Will be set by DB
        string $updatedAt = ''  // Will be set by DB
        // string $passwordHash // Typically not passed directly to user object constructor
    ) {
        $this->id = $id;
        $this->name = $name;
        $this->email = $email;
        $this->role = $role;
        $this->profilePictureUrl = $profilePictureUrl;
        $this->socialProvider = $socialProvider;
        $this->createdAt = $createdAt ?: date('Y-m-d H:i:s');
        $this->updatedAt = $updatedAt ?: date('Y-m-d H:i:s');
        // $this->passwordHash = $passwordHash;
    }

    /**
     * Get user data as an array suitable for JSON response (without sensitive data).
     */
    public function toArray(): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'email' => $this->email,
            'role' => $this->role,
            'profilePictureUrl' => $this->profilePictureUrl,
            'socialProvider' => $this->socialProvider,
            // 'createdAt' => $this->createdAt, // Often not needed in basic user object response
            // 'updatedAt' => $this->updatedAt, // Often not needed
        ];
    }

    /**
     * Static method to find a user by ID.
     * @param PDO $pdo PDO database connection object.
     * @param string $userId The ID of the user to find.
     * @return UserEntity|null The UserEntity object or null if not found.
     */
    public static function findById(PDO $pdo, string $userId): ?UserEntity
    {
        try {
            $stmt = $pdo->prepare("SELECT id, name, email, role, profile_picture_url, social_provider, created_at, updated_at FROM users WHERE id = :id");
            $stmt->bindParam(':id', $userId);
            $stmt->execute();
            $userData = $stmt->fetch(PDO::FETCH_ASSOC);

            if ($userData) {
                return new UserEntity(
                    $userData['id'],
                    $userData['name'],
                    $userData['email'],
                    $userData['role'],
                    $userData['profile_picture_url'],
                    $userData['social_provider'] ?? null,
                    $userData['created_at'],
                    $userData['updated_at']
                );
            }
            return null;
        } catch (PDOException $e) {
            error_log("Error finding user by ID {$userId}: " . $e->getMessage());
            return null;
        }
    }

    /**
     * Static method to find a user by email.
     * Includes password hash for authentication purposes within backend.
     * @param PDO $pdo PDO database connection object.
     * @param string $email The email of the user to find.
     * @return array|null User data array including password_hash, or null if not found.
     */
    public static function findByEmailWithPassword(PDO $pdo, string $email): ?array
    {
        try {
            $stmt = $pdo->prepare("SELECT id, name, email, password_hash, role, profile_picture_url, social_provider FROM users WHERE email = :email");
            $stmt->bindParam(':email', $email);
            $stmt->execute();
            return $stmt->fetch(PDO::FETCH_ASSOC) ?: null;
        } catch (PDOException $e) {
            error_log("Error finding user by email {$email}: " . $e->getMessage());
            return null;
        }
    }

    /**
     * Static method to create a new user.
     * @param PDO $pdo
     * @param string $id
     * @param string $name
     * @param string $email
     * @param string $password Plain text password (will be hashed)
     * @param string $role
     * @param string|null $profilePictureUrl
     * @param string|null $socialProvider
     * @return UserEntity|null The created UserEntity object or null on failure.
     */
    public static function create(PDO $pdo, string $id, string $name, string $email, string $password, string $role, ?string $profilePictureUrl = null, ?string $socialProvider = null): ?UserEntity
    {
        $passwordHash = password_hash($password, PASSWORD_BCRYPT);
        if ($passwordHash === false) {
            error_log("UserEntity::create - Password hashing failed for email: " . $email);
            return null;
        }

        try {
            $stmt = $pdo->prepare("INSERT INTO users (id, name, email, password_hash, role, profile_picture_url, social_provider) VALUES (:id, :name, :email, :password_hash, :role, :profile_picture_url, :social_provider)");
            $stmt->execute([
                ':id' => $id,
                ':name' => $name,
                ':email' => $email,
                ':password_hash' => $passwordHash,
                ':role' => $role,
                ':profile_picture_url' => $profilePictureUrl,
                ':social_provider' => $socialProvider
            ]);

            if ($stmt->rowCount() > 0) {
                // Fetch the newly created user to get DB-generated timestamps
                return self::findById($pdo, $id);
            }
            return null;
        } catch (PDOException $e) {
            error_log("UserEntity::create - Database error: " . $e->getMessage());
            return null;
        }
    }

    // You could add methods for updating user, changing password, etc.
    // However, for your current API structure, most of this logic is in the API endpoint files.
    // For example, an update method:
    // public function update(PDO $pdo, array $dataToUpdate): bool { ... }
}