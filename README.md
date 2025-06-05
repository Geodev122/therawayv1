
# TheraWay - Mental Health Web Application

TheraWay is a comprehensive mental health web application designed to connect clients with therapists and assist therapists in finding suitable clinic spaces. It features distinct dashboards and functionalities for Clients, Therapists, Clinic Owners, and Administrators.

## Key Features

*   **Clients:**
    *   Browse therapists via swipe, grid, and interactive map views.
    *   Filter therapists by name, location, specializations, languages, availability, and rating.
    *   View detailed therapist profiles.
    *   Like/save favorite therapists.
    *   Connect with therapists via WhatsApp (if number provided).
    *   Manage their basic user profile (name, email, profile picture).
*   **Therapists:**
    *   Create and manage a detailed professional profile: basic info, bio, WhatsApp, specializations, languages, qualifications, practice locations.
    *   Upload profile picture and an introductory video.
    *   Manage professional licenses and certifications, including file uploads.
    *   Browse and view details of rentable clinic spaces listed by clinic owners.
    *   Manage TheraWay membership: apply, submit payment proof, view status and history.
    *   Manage account settings (name, email).
*   **Clinic Owners:**
    *   Create and manage a detailed clinic profile: name, description, address, WhatsApp, operating hours, amenities.
    *   Upload clinic profile picture and additional photos.
    *   List and manage rentable clinic spaces: name, description, photos, rental price/duration, terms, features.
    *   View placeholder analytics for clinic engagement.
    *   Manage TheraWay membership for the clinic: apply, submit payment proof, view status and history.
    *   Manage personal account settings (name, email).
    *   Conceptual features: Manage password, request account deletion.
*   **Administrators:**
    *   Validate and manage therapist accounts: approve, reject, add admin notes.
    *   Approve and manage clinic accounts: approve, reject, add admin notes.
    *   View and manage user inquiries: view messages, respond, change status.
    *   Monitor system activity through an activity log.
    *   Export data for therapists and clinics.
*   **Platform-wide:**
    *   Secure JWT-based authentication for different user roles.
    *   Role-based access control to dashboards and features.
    *   Multilingual support (English & Arabic) with RTL for Arabic.
    *   File uploads for various media and documents.
    *   Interactive map view using Leaflet.js.

## Revised Comprehensive Plan for TheraWay.net

*   **Backend Technology:** PHP.
*   **Database:** MySQL/MariaDB. The schema is detailed in `readmedb.txt`.
*   **Authentication:** JWTs (JSON Web Tokens) for SPA-backend communication, utilizing the `firebase/php-jwt` PHP library.
*   **API Structure:** RESTful principles. API endpoints will reside in `/backend/api/`.
*   **Input Validation & Sanitization:** To be implemented on the PHP backend.
*   **Error Handling:** Consistent HTTP status codes and JSON error responses from the API.
*   **File Storage:** Server storage for uploads in a `/backend/uploads/` directory, secured appropriately.
*   **Geocoding:** Assumed to be handled by the backend (e.g., using Nominatim) if addresses need conversion to lat/lng for storage. Frontend displays map based on provided coordinates.
*   **Mapping Display:** Leaflet.js.
*   **CORS (Cross-Origin Resource Sharing):** PHP backend to configure `Access-Control-Allow-Origin`.

## Tech Stack

*   **Frontend:** React, TypeScript, Tailwind CSS, Leaflet.js
*   **Backend:** PHP
*   **Database:** MySQL / MariaDB
*   **JWT Library (PHP):** `firebase/php-jwt` (via Composer)

## Project Structure

```
/ (e.g., public_html on Hostinger)
├── index.html
├── index.tsx
├── App.tsx
├── components/
├── contexts/
├── pages/
├── locales/ (en.json, ar.json)
├── types.ts
├── constants.ts
├── README.md
├── metadata.json
├── backend/
│   ├── api/
│   │   ├── auth.php                    # Login, Signup
│   │   ├── upload.php                  # Handles all file uploads
│   │   ├── user_profile.php            # GET/PUT general user info (name, email, profile pic), password change, account deletion
│   │   ├── therapists.php              # GET list of live therapists (for public finder)
│   │   ├── client_favorites.php        # GET/POST client's favorite therapists
│   │   ├── therapist_profile.php       # GET/PUT detailed therapist profile data
│   │   ├── therapist_membership.php    # POST therapist membership application/renewal
│   │   ├── therapist_membership_history.php # GET therapist membership history
│   │   ├── therapist_certifications.php# POST/PUT/DELETE therapist certifications
│   │   ├── clinic_profile.php          # GET/PUT detailed clinic profile data
│   │   ├── clinic_membership.php       # POST clinic membership application/renewal
│   │   ├── clinic_membership_history.php # GET clinic membership history
│   │   ├── clinic_spaces.php           # GET all spaces (for therapist browsing), GET spaces by clinic_id (owner), POST/PUT/DELETE clinic spaces (owner)
│   │   ├── clinics.php                 # GET general list of clinics (e.g., for linking names/addresses)
│   │   ├── clinic_analytics.php        # GET clinic analytics data (placeholder)
│   │   ├── admin_therapists.php        # Admin: GET all therapists, PUT status/notes
│   │   ├── admin_clinics.php           # Admin: GET all clinics, PUT status/notes
│   │   ├── admin_inquiries.php         # Admin: GET/PUT user inquiries
│   │   ├── admin_activitylog.php       # Admin: GET/POST activity logs
│   │   └── export.php                  # Admin: GET data exports (CSV/JSON)
│   ├── config/
│   │   ├── db.php                      # Database connection details
│   │   └── core.php                    # Core settings (JWT secret, CORS, error reporting, upload paths)
│   ├── core/                           # Optional: PHP classes for DB models, helpers
│   │   └── ...
│   ├── uploads/                        # Directory for file uploads (permissions critical)
│   │   ├── .htaccess                   # Security for uploads directory
│   │   ├── profile_pictures/
│   │   ├── intro_videos/
│   │   ├── certifications/
│   │   ├── clinic_photos/
│   │   ├── space_photos/
│   │   └── payment_receipts/
│   ├── vendor/                         # Composer dependencies
│   └── composer.json                   # PHP dependencies (firebase/php-jwt)
└── readmedb.txt                        # Database schema (SQL CREATE TABLE statements)
```

## API Endpoints

All API endpoints are expected to return JSON with a `status` field ('success' or 'error') and a `message` field for errors. Successful data responses will be nested (e.g., `data.user`, `data.therapist`, `data.therapists`). Endpoints requiring authentication expect a JWT in the `Authorization: Bearer <token>` header.

### Authentication (`/backend/api/auth.php`)
*   **`POST` Signup**
    *   Body: `{ "action": "signup", "name": "...", "email": "...", "password": "...", "role": "CLIENT|THERAPIST|CLINIC_OWNER" }`
    *   Success Response: `{ "status": "success", "token": "...", "user": UserObject }`
*   **`POST` Login**
    *   Body: `{ "action": "login", "email": "...", "password": "..." }`
    *   Success Response: `{ "status": "success", "token": "...", "user": UserObject }`

### User Profile (`/backend/api/user_profile.php`) - Requires Auth
*   **`GET`**: Fetches authenticated user's basic profile (`User` object).
    *   Success Response: `{ "status": "success", "user": UserObject }`
*   **`PUT`**: Updates authenticated user's profile.
    *   Body: `{ "name": "...", "email": "...", "profilePictureUrl": "..." (optional, new URL if changed) }`
    *   Success Response: `{ "status": "success", "user": UserObject (updated) }`
*   **`POST` Change Password** (Conceptual)
    *   Body: `{ "action": "change_password", "currentPassword": "...", "newPassword": "..." }`
    *   Success Response: `{ "status": "success", "message": "Password updated." }`
*   **`POST` Request Deletion** (Conceptual)
    *   Body: `{ "action": "request_deletion", "reason": "..." (optional) }`
    *   Success Response: `{ "status": "success", "message": "Account deletion request received." }`

### File Upload (`/backend/api/upload.php`) - Requires Auth
*   **`POST`**: Multipart form data.
    *   Fields: `uploadType` (string: 'profilePicture', 'introVideo', 'certificationFile', 'clinicProfilePicture', 'spacePhoto_0'...'spacePhoto_N', 'paymentReceipt'), and the file itself (e.g., name `profilePicture` for `uploadType: 'profilePicture'`). `itemId` (optional, e.g., `clinic_id` or `space_id` for context).
    *   Success Response: `{ "status": "success", "fileUrl": "...", "message": "File uploaded." }`

### Therapists Public Listing (`/backend/api/therapists.php`) - Public
*   **`GET`**: Fetches live, verified therapists.
    *   Query Params: `page` (int), `limit` (int), `searchTerm` (string), `specializations` (comma-sep string), `languages` (comma-sep string), `minRating` (float), `availability` (comma-sep string), `locationSearch` (string).
    *   Success Response: `{ "status": "success", "therapists": [TherapistObject, ...], "pagination": { "currentPage": ..., "totalPages": ..., "totalItems": ... } }`

### Client Favorites (`/backend/api/client_favorites.php`) - Requires CLIENT Auth
*   **`GET`**: Fetches `therapist_user_id`s favorited by the client.
    *   Success Response: `{ "status": "success", "favorites": ["therapistId1", "therapistId2"] }`
*   **`POST`**: Toggles favorite status for a therapist.
    *   Body: `{ "therapistId": "..." }`
    *   Success Response: `{ "status": "success", "action": "added|removed", "favorites": ["therapistId1", ...] }`

### Therapist Specific (`/backend/api/therapist_profile.php`) - Requires THERAPIST/ADMIN Auth for PUT
*   **`GET ?userId={user_id}`**: Fetches detailed therapist profile.
    *   Success Response: `{ "status": "success", "therapist": TherapistObject }` or `{ "status": "not_found" }`
*   **`PUT`**: Updates authenticated therapist's detailed profile.
    *   Body: Full `Therapist` object with updates.
    *   Success Response: `{ "status": "success", "therapist": TherapistObject (updated) }`

### Therapist Membership (`/backend/api/therapist_membership.php`) - Requires THERAPIST Auth
*   **`POST`**: Submits/renews membership application.
    *   Body: `{ "userId": "...", "paymentReceiptUrl": "...", "applicationDate": "ISOString" }`
    *   Success Response: `{ "status": "success", "therapist": TherapistObject (updated with membership info) }`

### Therapist Membership History (`/backend/api/therapist_membership_history.php`) - Requires THERAPIST Auth
*   **`GET ?userId={user_id}`**: Fetches membership history.
    *   Success Response: `{ "status": "success", "history": [MembershipHistoryItem, ...] }`

### Therapist Certifications (`/backend/api/therapist_certifications.php`) - Requires THERAPIST Auth
*   **`POST`**: Adds a new certification.
    *   Body: `{ therapistId: "...", name: "...", fileUrl: "...", country: "..." }` (Certification object without ID)
    *   Success Response: `{ "status": "success", "therapist": TherapistObject (updated with new cert) }`
*   **`PUT`**: Updates a certification (e.g., admin verification, not for file change).
    *   Body: Full `Certification` object.
    *   Success Response: `{ "status": "success", "therapist": TherapistObject (updated) }`
*   **`DELETE`**: Deletes a certification.
    *   Body: `{ "certId": "...", "therapistId": "..." }`
    *   Success Response: `{ "status": "success", "therapist": TherapistObject (updated) }`

### Clinic Specific (`/backend/api/clinic_profile.php`) - Requires CLINIC_OWNER/ADMIN Auth for PUT
*   **`GET ?ownerId={user_id}`** or **`?clinicId={clinic_id}`**: Fetches detailed clinic profile.
    *   Success Response: `{ "status": "success", "clinic": ClinicObject (includes listings) }` or `{ "status": "not_found" }`
*   **`PUT`**: Updates clinic profile.
    *   Body: Full `Clinic` object with updates.
    *   Success Response: `{ "status": "success", "clinic": ClinicObject (updated) }`

### Clinic Membership (`/backend/api/clinic_membership.php`) - Requires CLINIC_OWNER Auth
*   **`POST`**: Submits/renews clinic membership.
    *   Body: `{ "clinicId": "...", "ownerId": "...", "paymentReceiptUrl": "...", "applicationDate": "ISOString" }`
    *   Success Response: `{ "status": "success", "clinic": ClinicObject (updated with membership info) }`

### Clinic Membership History (`/backend/api/clinic_membership_history.php`) - Requires CLINIC_OWNER Auth
*   **`GET ?clinicId={clinic_id}`**: Fetches membership history.
    *   Success Response: `{ "status": "success", "history": [MembershipHistoryItem, ...] }`

### Clinic Spaces (`/backend/api/clinic_spaces.php`)
*   **`GET` (Public/Therapist Browsing)**: Lists all available clinic spaces.
    *   Query Params: `location`, `minPrice`, `maxPrice`, `features` (comma-sep), `page`, `limit`.
    *   Success Response: `{ "status": "success", "spaces": [ClinicSpaceListing, ...], "pagination": {...} }`
*   **`GET ?clinicId={clinic_id}` (Owner View)**: Lists spaces for a specific clinic.
    *   Success Response: `{ "status": "success", "spaces": [ClinicSpaceListing, ...] }`
*   **`POST` (Owner Auth)**: Adds a new space.
    *   Body: `ClinicSpaceListing` object (without `id`, `clinicId` derived from auth or provided). `photos` array contains URLs of already uploaded photos.
    *   Success Response: `{ "status": "success", "listing": ClinicSpaceListingObject (with new ID) }`
*   **`PUT` (Owner Auth)**: Updates a space.
    *   Body: Full `ClinicSpaceListing` object. `photos` array contains URLs of already uploaded/kept photos.
    *   Success Response: `{ "status": "success", "listing": ClinicSpaceListingObject (updated) }`
*   **`DELETE` (Owner Auth)**: Deletes a space.
    *   Body: `{ "listingId": "..." }`
    *   Success Response: `{ "status": "success", "message": "Listing deleted." }`

### Clinics General Listing (`/backend/api/clinics.php`) - Public/Authenticated
*   **`GET`**: Fetches basic info for all live clinics.
    *   Success Response: `{ "status": "success", "clinics": [ClinicObject (summary), ...] }`

### Clinic Analytics (`/backend/api/clinic_analytics.php`) - Requires CLINIC_OWNER Auth
*   **`GET ?clinicId={clinic_id}`**: Fetches analytics.
    *   Success Response: `{ "status": "success", "analytics": { profileViews: ..., therapistConnections: ... } }` (Placeholder structure)

### Admin Endpoints - Require ADMIN Auth

*   **Admin: Therapists (`/backend/api/admin_therapists.php`)**
    *   `GET`: Fetches all therapists. Query Params: `status`, `searchTerm`.
        *   Response: `{ "status": "success", "data": [TherapistObject, ...] }`
    *   `PUT`: Updates therapist status/notes.
        *   Body: `{ "id": "...", "status": "...", "adminNotes": "..." }`
        *   Response: `{ "status": "success", "therapist": TherapistObject (updated) }`

*   **Admin: Clinics (`/backend/api/admin_clinics.php`)**
    *   `GET`: Fetches all clinics. Query Params: `status`, `searchTerm`.
        *   Response: `{ "status": "success", "data": [ClinicObject, ...] }`
    *   `PUT`: Updates clinic status/notes.
        *   Body: `{ "id": "...", "status": "...", "adminNotes": "..." }`
        *   Response: `{ "status": "success", "clinic": ClinicObject (updated) }`

*   **Admin: User Inquiries (`/backend/api/admin_inquiries.php`)**
    *   `GET`: Fetches inquiries. Query Params: `status`.
        *   Response: `{ "status": "success", "data": [UserInquiryObject, ...] }`
    *   `PUT`: Updates inquiry status/reply.
        *   Body: `{ "id": "...", "status": "...", "adminReply": "..." }`
        *   Response: `{ "status": "success", "inquiry": UserInquiryObject (updated) }`

*   **Admin: Activity Log (`/backend/api/admin_activitylog.php`)**
    *   `GET`: Fetches logs. Query Params: `action`, `user`.
        *   Response: `{ "status": "success", "data": [ActivityLogObject, ...] }`
    *   `POST`: Adds a new log entry.
        *   Body: `ActivityLog` object (server can generate `id`, `timestamp`).
        *   Response: `{ "status": "success", "log": ActivityLogObject (with ID/timestamp) }`

*   **Admin: Export Data (`/backend/api/export.php`)**
    *   `GET ?type=[therapists|clinics|logs|inquiries]&filters={...}`: Exports specified data. Filters object is URL-encoded JSON.
        *   Response: File download (e.g., CSV or JSON). Frontend might log this or handle via `window.location`.

## Database

The complete database schema is defined in `readmedb.txt`. Key tables include:
*   `users`: For all user types and authentication.
*   `therapists_data`: Detailed therapist profiles.
*   `clinics_data`: Detailed clinic profiles.
*   `certifications`: Therapist certifications.
*   `clinic_spaces`: Rentable spaces within clinics.
*   `client_therapist_favorites`: Client's favorited therapists.
*   `user_inquiries`: Support requests.
*   `activity_logs`: System and user actions.
*   `membership_history`: Tracks membership events for therapists and clinics.

## Security & Deployment Notes

*   **Remove Development Backdoors:** The special admin login (`geo.elnajjar@gmail.com`) in `AuthContext.tsx` is for development ONLY and **MUST be removed** before live deployment if the system is intended for general use.
*   **API Key Management (`process.env.API_KEY`):** The placeholder `YOUR_GEMINI_API_KEY_PLACEHOLDER` in `constants.ts` is a **critical security risk** if it's intended for a real, secret API key (like Google Gemini). Such keys should **NEVER** be exposed in frontend code. All calls to external services requiring secret API keys must be proxied through your PHP backend, where the key is stored securely.
*   **Hostinger Deployment:** The app (built static frontend and PHP backend) can be deployed to Hostinger shared hosting. Refer to deployment guides for setting up the database, PHP environment, file permissions (especially for `/backend/uploads/`), and CORS.
*   **Input Validation:** All user input must be validated and sanitized on the backend (PHP) to prevent XSS, SQL injection, and other vulnerabilities.
*   **HTTPS:** Ensure the live site uses HTTPS.

## Next Steps
*   Full backend implementation of all documented API endpoints.
*   Thorough testing of frontend-backend integration.
*   Security hardening (input validation, prepared statements, HTTPS, secure file uploads).
*   Performance optimization.
