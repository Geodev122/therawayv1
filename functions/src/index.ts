import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import * as express from 'express';
import * as cors from 'cors';

// Initialize Firebase Admin
admin.initializeApp();

// Initialize Express app
const app = express();

// Middleware
app.use(cors({ origin: true }));
app.use(express.json());

// Authentication middleware
const authenticate = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ status: 'error', message: 'Unauthorized' });
    }

    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await admin.auth().verifyIdToken(token);
    
    // Add user info to request
    req.user = {
      uid: decodedToken.uid,
      email: decodedToken.email,
      role: decodedToken.role || 'CLIENT'
    };
    
    next();
  } catch (error) {
    console.error('Error verifying auth token:', error);
    return res.status(401).json({ status: 'error', message: 'Unauthorized' });
  }
};

// Routes
app.get('/hello', (req, res) => {
  res.json({ message: 'Hello from Firebase Functions!' });
});

// Protected route example
app.get('/protected', authenticate, (req, res) => {
  res.json({ 
    status: 'success', 
    message: 'This is a protected endpoint', 
    user: req.user 
  });
});

// Therapists API
app.get('/therapists', async (req, res) => {
  try {
    const therapistsSnapshot = await admin.firestore()
      .collection('therapists_data')
      .where('accountStatus', '==', 'live')
      .get();
    
    const therapists = therapistsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    res.json({ 
      status: 'success', 
      therapists,
      pagination: {
        currentPage: 1,
        totalPages: 1,
        totalItems: therapists.length,
        itemsPerPage: therapists.length
      }
    });
  } catch (error) {
    console.error('Error fetching therapists:', error);
    res.status(500).json({ status: 'error', message: 'Failed to fetch therapists' });
  }
});

// Therapist detail API
app.get('/therapists/:id', async (req, res) => {
  try {
    const therapistId = req.params.id;
    const therapistDoc = await admin.firestore().collection('therapists_data').doc(therapistId).get();
    
    if (!therapistDoc.exists) {
      return res.status(404).json({ status: 'not_found', message: 'Therapist not found' });
    }
    
    const therapist = {
      id: therapistDoc.id,
      ...therapistDoc.data()
    };
    
    res.json({ status: 'success', therapist });
  } catch (error) {
    console.error('Error fetching therapist:', error);
    res.status(500).json({ status: 'error', message: 'Failed to fetch therapist' });
  }
});

// Client favorites API
app.get('/client_favorites', authenticate, async (req, res) => {
  try {
    const userId = req.user.uid;
    
    const favoritesSnapshot = await admin.firestore()
      .collection('client_therapist_favorites')
      .where('clientId', '==', userId)
      .get();
    
    const favorites = favoritesSnapshot.docs.map(doc => doc.data().therapistId);
    
    res.json({ status: 'success', data: favorites });
  } catch (error) {
    console.error('Error fetching favorites:', error);
    res.status(500).json({ status: 'error', message: 'Failed to fetch favorites' });
  }
});

app.post('/client_favorites', authenticate, async (req, res) => {
  try {
    const userId = req.user.uid;
    const { therapistId } = req.body;
    
    if (!therapistId) {
      return res.status(400).json({ status: 'error', message: 'Therapist ID is required' });
    }
    
    // Check if favorite already exists
    const favoriteId = `${userId}_${therapistId}`;
    const favoriteDoc = await admin.firestore().collection('client_therapist_favorites').doc(favoriteId).get();
    
    if (favoriteDoc.exists) {
      // Remove favorite
      await admin.firestore().collection('client_therapist_favorites').doc(favoriteId).delete();
      
      // Get updated favorites
      const favoritesSnapshot = await admin.firestore()
        .collection('client_therapist_favorites')
        .where('clientId', '==', userId)
        .get();
      
      const favorites = favoritesSnapshot.docs.map(doc => doc.data().therapistId);
      
      return res.json({ 
        status: 'success', 
        message: 'Favorite removed successfully',
        action: 'removed',
        data: favorites
      });
    } else {
      // Add favorite
      await admin.firestore().collection('client_therapist_favorites').doc(favoriteId).set({
        clientId: userId,
        therapistId,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
      
      // Get updated favorites
      const favoritesSnapshot = await admin.firestore()
        .collection('client_therapist_favorites')
        .where('clientId', '==', userId)
        .get();
      
      const favorites = favoritesSnapshot.docs.map(doc => doc.data().therapistId);
      
      return res.json({ 
        status: 'success', 
        message: 'Favorite added successfully',
        action: 'added',
        data: favorites
      });
    }
  } catch (error) {
    console.error('Error toggling favorite:', error);
    res.status(500).json({ status: 'error', message: 'Failed to toggle favorite' });
  }
});

// Export the Express app as a Firebase Function
export const api = functions.https.onRequest(app);

// User creation trigger to set custom claims (roles)
export const setUserRole = functions.auth.user().onCreate(async (user) => {
  try {
    // Get user document from Firestore
    const userDoc = await admin.firestore().collection('users').doc(user.uid).get();
    
    if (!userDoc.exists) {
      console.log(`No user document found for ${user.uid}`);
      return null;
    }
    
    const userData = userDoc.data();
    const role = userData?.role || 'CLIENT';
    
    // Set custom claims based on role
    await admin.auth().setCustomUserClaims(user.uid, { role });
    
    console.log(`Set custom claims for ${user.uid}: role=${role}`);
    return null;
  } catch (error) {
    console.error('Error setting user role:', error);
    return null;
  }
});