-- TheraWay Database Schema
-- Compatible with MariaDB and phpMyAdmin
-- Last Updated: 2025-06-03

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- =========================
-- USERS TABLE
-- =========================
CREATE TABLE IF NOT EXISTS `users` (
  `id` VARCHAR(255) NOT NULL,
  `name` VARCHAR(255) NOT NULL,
  `email` VARCHAR(255) NOT NULL UNIQUE,
  `password_hash` VARCHAR(255) NOT NULL,
  `role` ENUM('CLIENT', 'THERAPIST', 'CLINIC_OWNER', 'ADMIN') NOT NULL DEFAULT 'CLIENT',
  `profile_picture_url` VARCHAR(2048) DEFAULT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `email_idx` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =========================
-- THERAPISTS DATA TABLE
-- =========================
CREATE TABLE IF NOT EXISTS `therapists_data` (
  `user_id` VARCHAR(255) NOT NULL,
  `bio` TEXT,
  `whatsapp_number` VARCHAR(50) DEFAULT NULL,
  `intro_video_url` VARCHAR(2048) DEFAULT NULL,
  `account_status` ENUM('draft', 'pending_approval', 'live', 'rejected') DEFAULT 'draft',
  `admin_notes` TEXT DEFAULT NULL,
  `membership_application_date` TIMESTAMP NULL DEFAULT NULL,
  `membership_payment_receipt_url` VARCHAR(2048) DEFAULT NULL,
  `membership_status_message` VARCHAR(255) DEFAULT NULL,
  `membership_renewal_date` TIMESTAMP NULL DEFAULT NULL,
  `specializations` JSON DEFAULT NULL,
  `languages` JSON DEFAULT NULL,
  `qualifications` JSON DEFAULT NULL,
  `locations` JSON DEFAULT NULL,
  `rating` DECIMAL(2,1) DEFAULT 0.0,
  `review_count` INT UNSIGNED DEFAULT 0,
  `profile_views` INT UNSIGNED DEFAULT 0,
  `likes_count` INT UNSIGNED DEFAULT 0,
  `is_overall_verified` BOOLEAN DEFAULT FALSE,
  `availability` JSON DEFAULT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`),
  CONSTRAINT `fk_therapists_data_users` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =========================
-- CLINICS DATA TABLE
-- =========================
CREATE TABLE IF NOT EXISTS `clinics_data` (
  `user_id` VARCHAR(255) NOT NULL,
  `clinic_id` VARCHAR(255) NOT NULL UNIQUE,
  `clinic_name` VARCHAR(255) NOT NULL,
  `description` TEXT,
  `address` VARCHAR(512) DEFAULT NULL,
  `latitude` DECIMAL(10,8) DEFAULT NULL,
  `longitude` DECIMAL(11,8) DEFAULT NULL,
  `clinic_profile_picture_url` VARCHAR(2048) DEFAULT NULL,
  `clinic_photos` JSON DEFAULT NULL,
  `amenities` JSON DEFAULT NULL,
  `operating_hours` JSON DEFAULT NULL,
  `services` JSON DEFAULT NULL,
  `whatsapp_number` VARCHAR(50) DEFAULT NULL,
  `is_verified_by_admin` BOOLEAN DEFAULT FALSE,
  `account_status` ENUM('draft', 'pending_approval', 'live', 'rejected') DEFAULT 'draft',
  `admin_notes` TEXT DEFAULT NULL,
  `theraway_membership_status` ENUM('active', 'pending_payment', 'pending_approval', 'expired', 'cancelled', 'none') DEFAULT 'none',
  `theraway_membership_tier_name` VARCHAR(100) DEFAULT NULL,
  `theraway_membership_renewal_date` TIMESTAMP NULL DEFAULT NULL,
  `theraway_membership_application_date` TIMESTAMP NULL DEFAULT NULL,
  `theraway_membership_payment_receipt_url` VARCHAR(2048) DEFAULT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`),
  UNIQUE KEY `clinic_id_unique_idx` (`clinic_id`),
  CONSTRAINT `fk_clinics_data_users` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =========================
-- CERTIFICATIONS TABLE
-- =========================
CREATE TABLE IF NOT EXISTS `certifications` (
  `id` VARCHAR(255) NOT NULL,
  `therapist_user_id` VARCHAR(255) NOT NULL,
  `name` VARCHAR(255) NOT NULL,
  `file_url` VARCHAR(2048) NOT NULL,
  `country` VARCHAR(100) DEFAULT NULL,
  `is_verified_by_admin` BOOLEAN DEFAULT FALSE,
  `verification_notes` TEXT DEFAULT NULL,
  `uploaded_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  CONSTRAINT `fk_certifications_therapists` FOREIGN KEY (`therapist_user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =========================
-- CLINIC SPACES TABLE
-- =========================
CREATE TABLE IF NOT EXISTS `clinic_spaces` (
  `id` VARCHAR(255) NOT NULL,
  `clinic_id` VARCHAR(255) NOT NULL,
  `name` VARCHAR(255) NOT NULL,
  `description` TEXT,
  `photos` JSON DEFAULT NULL,
  `rental_price` DECIMAL(10,2) NOT NULL,
  `rental_duration` VARCHAR(50) NOT NULL,
  `rental_terms` TEXT,
  `features` JSON DEFAULT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  CONSTRAINT `fk_clinic_spaces_clinics` FOREIGN KEY (`clinic_id`) REFERENCES `clinics_data` (`clinic_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =========================
-- CLIENT-THERAPIST FAVORITES TABLE
-- =========================
CREATE TABLE IF NOT EXISTS `client_therapist_favorites` (
  `client_user_id` VARCHAR(255) NOT NULL,
  `therapist_user_id` VARCHAR(255) NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`client_user_id`, `therapist_user_id`),
  CONSTRAINT `fk_client_favorites_users` FOREIGN KEY (`client_user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_therapist_favorites_users` FOREIGN KEY (`therapist_user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =========================
-- USER INQUIRIES TABLE
-- =========================
CREATE TABLE IF NOT EXISTS `user_inquiries` (
  `id` VARCHAR(255) NOT NULL,
  `user_id` VARCHAR(255) NULL,
  `user_name` VARCHAR(255) DEFAULT NULL,
  `user_email` VARCHAR(255) NOT NULL,
  `subject` VARCHAR(255) NOT NULL,
  `message` TEXT NOT NULL,
  `date` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `status` ENUM('open', 'closed', 'pending_admin_response', 'escalated') DEFAULT 'open',
  `priority` ENUM('low', 'medium', 'high') DEFAULT 'medium',
  `category` VARCHAR(100) DEFAULT NULL,
  `admin_reply` TEXT DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `user_id_fk_idx` (`user_id`),
  CONSTRAINT `fk_inquiries_users` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =========================
-- ACTIVITY LOGS TABLE
-- =========================
CREATE TABLE IF NOT EXISTS `activity_logs` (
  `id` VARCHAR(255) NOT NULL,
  `timestamp` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `user_id` VARCHAR(255) DEFAULT NULL,
  `user_name` VARCHAR(255) DEFAULT NULL,
  `user_role` ENUM('CLIENT', 'THERAPIST', 'CLINIC_OWNER', 'ADMIN') DEFAULT NULL,
  `action` VARCHAR(255) NOT NULL,
  `target_id` VARCHAR(255) DEFAULT NULL,
  `target_type` VARCHAR(50) DEFAULT NULL,
  `details` TEXT DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `user_id_log_idx` (`user_id`),
  KEY `action_log_idx` (`action`),
  KEY `target_log_idx` (`target_id`, `target_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =========================
-- MEMBERSHIP HISTORY TABLE
-- =========================
CREATE TABLE IF NOT EXISTS `membership_history` (
  `id` VARCHAR(255) NOT NULL,
  `target_id` VARCHAR(255) NOT NULL,
  `target_type` ENUM('THERAPIST', 'CLINIC') NOT NULL,
  `action_date` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `action_description` VARCHAR(512) NOT NULL,
  `details_json` JSON DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `membership_target_idx` (`target_id`, `target_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;

-- =========================
-- Example Insert (for a mock admin user)
-- =========================
-- Replace the password hash with a real bcrypt hash!
-- INSERT INTO `users` (`id`, `name`, `email`, `password_hash`, `role`) VALUES
-- ('admin-super-001', 'Super Admin', 'admin@example.com', '$2y$10$xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', 'ADMIN');