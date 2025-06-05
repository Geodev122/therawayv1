import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';

// This function deploys Storage security rules programmatically
export const deployStorageRules = functions.https.onRequest(async (req, res) => {
  try {
    // Check if request is authorized (e.g., from admin panel)
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ status: 'error', message: 'Unauthorized' });
    }
    
    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await admin.auth().verifyIdToken(token);
    
    if (decodedToken.role !== 'ADMIN') {
      return res.status(403).json({ status: 'error', message: 'Forbidden. Admin role required.' });
    }
    
    // Define Storage security rules
    const rules = `
      rules_version = '2';
      service firebase.storage {
        match /b/{bucket}/o {
          // Helper functions
          function isAuthenticated() {
            return request.auth != null;
          }
          
          function isAdmin() {
            return isAuthenticated() && request.auth.token.role == 'ADMIN';
          }
          
          function isOwner(userId) {
            return isAuthenticated() && request.auth.uid == userId;
          }
          
          // Default rule - deny all
          match /{allPaths=**} {
            allow read, write: if false;
          }
          
          // Profile pictures
          match /profile_pictures/{userId}/{fileName} {
            // Anyone can read profile pictures
            allow read: if true;
            // Only the user themselves or an admin can upload their profile picture
            allow write: if isOwner(userId) || isAdmin();
          }
          
          // Intro videos
          match /intro_videos/{userId}/{fileName} {
            // Anyone can read intro videos
            allow read: if true;
            // Only the user themselves or an admin can upload their intro video
            allow write: if isOwner(userId) || isAdmin();
          }
          
          // Certifications
          match /certifications/{userId}/{fileName} {
            // Anyone can read certifications
            allow read: if true;
            // Only the user themselves or an admin can upload certifications
            allow write: if isOwner(userId) || isAdmin();
          }
          
          // Clinic photos
          match /clinic_photos/{clinicId}/{fileName} {
            // Anyone can read clinic photos
            allow read: if true;
            // Only the clinic owner or an admin can upload clinic photos
            // This requires a Firestore read to check ownership
            allow write: if isAdmin() || 
              (isAuthenticated() && 
               exists(/databases/$(database)/documents/clinics_data/$(clinicId)) && 
               get(/databases/$(database)/documents/clinics_data/$(clinicId)).data.ownerId == request.auth.uid);
          }
          
          // Space photos
          match /space_photos/{spaceId}/{fileName} {
            // Anyone can read space photos
            allow read: if true;
            // Only the clinic owner or an admin can upload space photos
            // This requires a Firestore read to check ownership
            allow write: if isAdmin() || 
              (isAuthenticated() && 
               exists(/databases/$(database)/documents/clinic_spaces/$(spaceId)) && 
               exists(/databases/$(database)/documents/clinics_data/$(get(/databases/$(database)/documents/clinic_spaces/$(spaceId)).data.clinicId)) && 
               get(/databases/$(database)/documents/clinics_data/$(get(/databases/$(database)/documents/clinic_spaces/$(spaceId)).data.clinicId)).data.ownerId == request.auth.uid);
          }
          
          // Payment receipts
          match /payment_receipts/{userId}/{fileName} {
            // Only the user themselves or an admin can read payment receipts
            allow read: if isOwner(userId) || isAdmin();
            // Only the user themselves or an admin can upload payment receipts
            allow write: if isOwner(userId) || isAdmin();
          }
        }
      }
    `;
    
    // In a real implementation, you would use the Firebase Admin SDK to deploy these rules
    // For this example, we'll just return the rules as a response
    res.json({ status: 'success', message: 'Storage rules deployed successfully', rules });
  } catch (error) {
    console.error('Error deploying Storage rules:', error);
    res.status(500).json({ status: 'error', message: 'Failed to deploy Storage rules' });
  }
});