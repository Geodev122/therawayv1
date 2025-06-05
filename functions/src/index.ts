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
      role: decodedToken.role || 'CLIENT',
      name: decodedToken.name
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
    const { page = '1', limit = '20', searchTerm, specializations, languages, minRating, availability, locationSearch } = req.query;
    
    // Build query
    let query = admin.firestore().collection('therapists_data').where('accountStatus', '==', 'live');
    
    // Apply filters
    if (searchTerm) {
      query = query.where('name', '>=', searchTerm).where('name', '<=', searchTerm + '\uf8ff');
    }
    
    // Note: For complex filtering like arrays, we'll need to fetch all and filter in memory
    // or use a more sophisticated approach like Algolia
    
    // Execute query
    const snapshot = await query.get();
    
    // Manual filtering for array fields and other complex filters
    let therapists = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    // Filter by specializations
    if (specializations) {
      const specArray = (specializations as string).split(',');
      therapists = therapists.filter(therapist => 
        therapist.specializations && specArray.some(spec => 
          therapist.specializations.includes(spec)
        )
      );
    }
    
    // Filter by languages
    if (languages) {
      const langArray = (languages as string).split(',');
      therapists = therapists.filter(therapist => 
        therapist.languages && langArray.some(lang => 
          therapist.languages.includes(lang)
        )
      );
    }
    
    // Filter by minimum rating
    if (minRating) {
      const rating = parseFloat(minRating as string);
      therapists = therapists.filter(therapist => 
        therapist.rating >= rating
      );
    }
    
    // Filter by availability
    if (availability) {
      const availArray = (availability as string).split(',');
      therapists = therapists.filter(therapist => 
        therapist.availability && availArray.some(avail => 
          therapist.availability.includes(avail)
        )
      );
    }
    
    // Filter by location search
    if (locationSearch) {
      therapists = therapists.filter(therapist => 
        therapist.locations && therapist.locations.some(location => 
          location.address.toLowerCase().includes((locationSearch as string).toLowerCase())
        )
      );
    }
    
    // Pagination
    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);
    const startIndex = (pageNum - 1) * limitNum;
    const endIndex = pageNum * limitNum;
    const paginatedTherapists = therapists.slice(startIndex, endIndex);
    
    res.json({ 
      status: 'success', 
      therapists: paginatedTherapists,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(therapists.length / limitNum),
        totalItems: therapists.length,
        itemsPerPage: limitNum
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

// Therapist profile API
app.get('/therapist_profile', authenticate, async (req, res) => {
  try {
    const { userId } = req.query;
    
    if (!userId) {
      return res.status(400).json({ status: 'error', message: 'User ID is required' });
    }
    
    const therapistDoc = await admin.firestore().collection('therapists_data').doc(userId as string).get();
    
    if (!therapistDoc.exists) {
      return res.status(404).json({ status: 'not_found', message: 'Therapist profile not found' });
    }
    
    const therapist = {
      id: therapistDoc.id,
      ...therapistDoc.data()
    };
    
    // Get certifications
    const certificationsSnapshot = await admin.firestore()
      .collection('certifications')
      .where('therapistUserId', '==', userId)
      .get();
    
    const certifications = certificationsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    therapist.certifications = certifications;
    
    res.json({ status: 'success', therapist });
  } catch (error) {
    console.error('Error fetching therapist profile:', error);
    res.status(500).json({ status: 'error', message: 'Failed to fetch therapist profile' });
  }
});

app.put('/therapist_profile', authenticate, async (req, res) => {
  try {
    const { id, ...updateData } = req.body;
    
    if (!id) {
      return res.status(400).json({ status: 'error', message: 'Therapist ID is required' });
    }
    
    // Check if user is authorized (therapist themselves or admin)
    if (req.user.uid !== id && req.user.role !== 'ADMIN') {
      return res.status(403).json({ status: 'error', message: 'Unauthorized to update this profile' });
    }
    
    // Update therapist profile
    await admin.firestore().collection('therapists_data').doc(id).update({
      ...updateData,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    // Get updated profile
    const updatedDoc = await admin.firestore().collection('therapists_data').doc(id).get();
    const updatedTherapist = {
      id: updatedDoc.id,
      ...updatedDoc.data()
    };
    
    // Get certifications
    const certificationsSnapshot = await admin.firestore()
      .collection('certifications')
      .where('therapistUserId', '==', id)
      .get();
    
    const certifications = certificationsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    updatedTherapist.certifications = certifications;
    
    res.json({ status: 'success', therapist: updatedTherapist });
  } catch (error) {
    console.error('Error updating therapist profile:', error);
    res.status(500).json({ status: 'error', message: 'Failed to update therapist profile' });
  }
});

// Therapist certifications API
app.post('/therapist_certifications', authenticate, async (req, res) => {
  try {
    const { therapistId, name, fileUrl, country } = req.body;
    
    if (!therapistId || !name || !fileUrl) {
      return res.status(400).json({ status: 'error', message: 'Therapist ID, name, and file URL are required' });
    }
    
    // Check if user is authorized (therapist themselves or admin)
    if (req.user.uid !== therapistId && req.user.role !== 'ADMIN') {
      return res.status(403).json({ status: 'error', message: 'Unauthorized to add certification to this profile' });
    }
    
    // Create certification
    const certId = `cert_${Date.now()}`;
    await admin.firestore().collection('certifications').doc(certId).set({
      id: certId,
      therapistUserId: therapistId,
      name,
      fileUrl,
      country: country || '',
      isVerified: false,
      uploadedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    // Get updated therapist profile with certifications
    const therapistDoc = await admin.firestore().collection('therapists_data').doc(therapistId).get();
    const therapist = {
      id: therapistDoc.id,
      ...therapistDoc.data()
    };
    
    const certificationsSnapshot = await admin.firestore()
      .collection('certifications')
      .where('therapistUserId', '==', therapistId)
      .get();
    
    const certifications = certificationsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    therapist.certifications = certifications;
    
    res.status(201).json({ status: 'success', message: 'Certification added successfully', therapist });
  } catch (error) {
    console.error('Error adding certification:', error);
    res.status(500).json({ status: 'error', message: 'Failed to add certification' });
  }
});

app.put('/therapist_certifications', authenticate, async (req, res) => {
  try {
    const { id, therapistUserId, ...updateData } = req.body;
    
    if (!id || !therapistUserId) {
      return res.status(400).json({ status: 'error', message: 'Certification ID and therapist ID are required' });
    }
    
    // Check if certification exists
    const certDoc = await admin.firestore().collection('certifications').doc(id).get();
    
    if (!certDoc.exists) {
      return res.status(404).json({ status: 'error', message: 'Certification not found' });
    }
    
    // Check if user is authorized (therapist themselves or admin)
    if (req.user.uid !== therapistUserId && req.user.role !== 'ADMIN') {
      return res.status(403).json({ status: 'error', message: 'Unauthorized to update this certification' });
    }
    
    // Update certification
    await admin.firestore().collection('certifications').doc(id).update({
      ...updateData,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    // Get updated therapist profile with certifications
    const therapistDoc = await admin.firestore().collection('therapists_data').doc(therapistUserId).get();
    const therapist = {
      id: therapistDoc.id,
      ...therapistDoc.data()
    };
    
    const certificationsSnapshot = await admin.firestore()
      .collection('certifications')
      .where('therapistUserId', '==', therapistUserId)
      .get();
    
    const certifications = certificationsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    therapist.certifications = certifications;
    
    res.json({ status: 'success', message: 'Certification updated successfully', therapist });
  } catch (error) {
    console.error('Error updating certification:', error);
    res.status(500).json({ status: 'error', message: 'Failed to update certification' });
  }
});

app.delete('/therapist_certifications', authenticate, async (req, res) => {
  try {
    const { certId, therapistId } = req.body;
    
    if (!certId || !therapistId) {
      return res.status(400).json({ status: 'error', message: 'Certification ID and therapist ID are required' });
    }
    
    // Check if certification exists
    const certDoc = await admin.firestore().collection('certifications').doc(certId).get();
    
    if (!certDoc.exists) {
      return res.status(404).json({ status: 'error', message: 'Certification not found' });
    }
    
    // Check if user is authorized (therapist themselves or admin)
    if (req.user.uid !== therapistId && req.user.role !== 'ADMIN') {
      return res.status(403).json({ status: 'error', message: 'Unauthorized to delete this certification' });
    }
    
    // Delete certification
    await admin.firestore().collection('certifications').doc(certId).delete();
    
    // Get updated therapist profile with certifications
    const therapistDoc = await admin.firestore().collection('therapists_data').doc(therapistId).get();
    const therapist = {
      id: therapistDoc.id,
      ...therapistDoc.data()
    };
    
    const certificationsSnapshot = await admin.firestore()
      .collection('certifications')
      .where('therapistUserId', '==', therapistId)
      .get();
    
    const certifications = certificationsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    therapist.certifications = certifications;
    
    res.json({ status: 'success', message: 'Certification deleted successfully', therapist });
  } catch (error) {
    console.error('Error deleting certification:', error);
    res.status(500).json({ status: 'error', message: 'Failed to delete certification' });
  }
});

// Clinic profile API
app.get('/clinic_profile', async (req, res) => {
  try {
    const { clinicId, ownerId } = req.query;
    
    if (!clinicId && !ownerId) {
      return res.status(400).json({ status: 'error', message: 'Clinic ID or Owner ID is required' });
    }
    
    let clinicDoc;
    
    if (clinicId) {
      clinicDoc = await admin.firestore().collection('clinics_data').doc(clinicId as string).get();
    } else {
      const clinicsSnapshot = await admin.firestore()
        .collection('clinics_data')
        .where('ownerId', '==', ownerId)
        .limit(1)
        .get();
      
      if (clinicsSnapshot.empty) {
        return res.status(404).json({ status: 'not_found', message: 'Clinic not found' });
      }
      
      clinicDoc = clinicsSnapshot.docs[0];
    }
    
    if (!clinicDoc.exists) {
      return res.status(404).json({ status: 'not_found', message: 'Clinic not found' });
    }
    
    const clinic = {
      id: clinicDoc.id,
      ...clinicDoc.data()
    };
    
    // Get clinic spaces (listings)
    const spacesSnapshot = await admin.firestore()
      .collection('clinic_spaces')
      .where('clinicId', '==', clinic.id)
      .get();
    
    const spaces = spacesSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    clinic.listings = spaces;
    
    // Get owner info
    const ownerDoc = await admin.firestore().collection('users').doc(clinic.ownerId).get();
    
    if (ownerDoc.exists) {
      clinic.ownerName = ownerDoc.data()?.name;
      clinic.ownerEmail = ownerDoc.data()?.email;
    }
    
    res.json({ status: 'success', clinic });
  } catch (error) {
    console.error('Error fetching clinic profile:', error);
    res.status(500).json({ status: 'error', message: 'Failed to fetch clinic profile' });
  }
});

app.put('/clinic_profile', authenticate, async (req, res) => {
  try {
    const { id, ...updateData } = req.body;
    
    if (!id) {
      return res.status(400).json({ status: 'error', message: 'Clinic ID is required' });
    }
    
    // Get current clinic data to check ownership
    const clinicDoc = await admin.firestore().collection('clinics_data').doc(id).get();
    
    if (!clinicDoc.exists) {
      return res.status(404).json({ status: 'error', message: 'Clinic not found' });
    }
    
    const clinicData = clinicDoc.data();
    
    // Check if user is authorized (clinic owner or admin)
    if (req.user.uid !== clinicData?.ownerId && req.user.role !== 'ADMIN') {
      return res.status(403).json({ status: 'error', message: 'Unauthorized to update this clinic' });
    }
    
    // Update clinic profile
    await admin.firestore().collection('clinics_data').doc(id).update({
      ...updateData,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    // Get updated clinic profile
    const updatedDoc = await admin.firestore().collection('clinics_data').doc(id).get();
    const clinic = {
      id: updatedDoc.id,
      ...updatedDoc.data()
    };
    
    // Get clinic spaces (listings)
    const spacesSnapshot = await admin.firestore()
      .collection('clinic_spaces')
      .where('clinicId', '==', clinic.id)
      .get();
    
    const spaces = spacesSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    clinic.listings = spaces;
    
    // Get owner info
    const ownerDoc = await admin.firestore().collection('users').doc(clinic.ownerId).get();
    
    if (ownerDoc.exists) {
      clinic.ownerName = ownerDoc.data()?.name;
      clinic.ownerEmail = ownerDoc.data()?.email;
    }
    
    res.json({ status: 'success', message: 'Clinic profile updated successfully', clinic });
  } catch (error) {
    console.error('Error updating clinic profile:', error);
    res.status(500).json({ status: 'error', message: 'Failed to update clinic profile' });
  }
});

// Clinic spaces API
app.get('/clinic_spaces', async (req, res) => {
  try {
    const { clinicId, location, minPrice, maxPrice, features, page = '1', limit = '10' } = req.query;
    
    let query = admin.firestore().collection('clinic_spaces');
    
    // Filter by clinic ID if provided
    if (clinicId) {
      query = query.where('clinicId', '==', clinicId);
    }
    
    // Execute query
    const snapshot = await query.get();
    
    // Manual filtering for complex filters
    let spaces = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    // Filter by location
    if (location) {
      spaces = spaces.filter(space => 
        space.name.toLowerCase().includes((location as string).toLowerCase()) ||
        space.description.toLowerCase().includes((location as string).toLowerCase()) ||
        space.clinicAddress?.toLowerCase().includes((location as string).toLowerCase())
      );
    }
    
    // Filter by price range
    if (minPrice) {
      spaces = spaces.filter(space => space.rentalPrice >= parseFloat(minPrice as string));
    }
    
    if (maxPrice) {
      spaces = spaces.filter(space => space.rentalPrice <= parseFloat(maxPrice as string));
    }
    
    // Filter by features
    if (features) {
      const featuresArray = (features as string).split(',');
      spaces = spaces.filter(space => 
        space.features && featuresArray.some(feature => 
          space.features.includes(feature)
        )
      );
    }
    
    // Pagination
    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);
    const startIndex = (pageNum - 1) * limitNum;
    const endIndex = pageNum * limitNum;
    const paginatedSpaces = spaces.slice(startIndex, endIndex);
    
    res.json({ 
      status: 'success', 
      spaces: paginatedSpaces,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(spaces.length / limitNum),
        totalItems: spaces.length,
        itemsPerPage: limitNum
      }
    });
  } catch (error) {
    console.error('Error fetching clinic spaces:', error);
    res.status(500).json({ status: 'error', message: 'Failed to fetch clinic spaces' });
  }
});

app.post('/clinic_spaces', authenticate, async (req, res) => {
  try {
    const { clinicId, name, description, photos, rentalPrice, rentalDuration, rentalTerms, features } = req.body;
    
    if (!clinicId || !name) {
      return res.status(400).json({ status: 'error', message: 'Clinic ID and name are required' });
    }
    
    // Check if clinic exists and user is authorized
    const clinicDoc = await admin.firestore().collection('clinics_data').doc(clinicId).get();
    
    if (!clinicDoc.exists) {
      return res.status(404).json({ status: 'error', message: 'Clinic not found' });
    }
    
    const clinicData = clinicDoc.data();
    
    // Check if user is authorized (clinic owner or admin)
    if (req.user.uid !== clinicData?.ownerId && req.user.role !== 'ADMIN') {
      return res.status(403).json({ status: 'error', message: 'Unauthorized to add spaces to this clinic' });
    }
    
    // Create space
    const spaceId = `space_${Date.now()}`;
    const spaceData = {
      id: spaceId,
      clinicId,
      name,
      description: description || '',
      photos: photos || [],
      rentalPrice: rentalPrice || 0,
      rentalDuration: rentalDuration || 'per hour',
      rentalTerms: rentalTerms || '',
      features: features || [],
      clinicName: clinicData?.name || '',
      clinicAddress: clinicData?.address || '',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };
    
    await admin.firestore().collection('clinic_spaces').doc(spaceId).set(spaceData);
    
    res.status(201).json({ 
      status: 'success', 
      message: 'Clinic space added successfully',
      listing: spaceData
    });
  } catch (error) {
    console.error('Error adding clinic space:', error);
    res.status(500).json({ status: 'error', message: 'Failed to add clinic space' });
  }
});

app.put('/clinic_spaces', authenticate, async (req, res) => {
  try {
    const { id, clinicId, ...updateData } = req.body;
    
    if (!id || !clinicId) {
      return res.status(400).json({ status: 'error', message: 'Space ID and clinic ID are required' });
    }
    
    // Check if space exists
    const spaceDoc = await admin.firestore().collection('clinic_spaces').doc(id).get();
    
    if (!spaceDoc.exists) {
      return res.status(404).json({ status: 'error', message: 'Space not found' });
    }
    
    // Check if clinic exists and user is authorized
    const clinicDoc = await admin.firestore().collection('clinics_data').doc(clinicId).get();
    
    if (!clinicDoc.exists) {
      return res.status(404).json({ status: 'error', message: 'Clinic not found' });
    }
    
    const clinicData = clinicDoc.data();
    
    // Check if user is authorized (clinic owner or admin)
    if (req.user.uid !== clinicData?.ownerId && req.user.role !== 'ADMIN') {
      return res.status(403).json({ status: 'error', message: 'Unauthorized to update spaces for this clinic' });
    }
    
    // Update space
    await admin.firestore().collection('clinic_spaces').doc(id).update({
      ...updateData,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    // Get updated space
    const updatedDoc = await admin.firestore().collection('clinic_spaces').doc(id).get();
    const updatedSpace = {
      id: updatedDoc.id,
      ...updatedDoc.data()
    };
    
    res.json({ 
      status: 'success', 
      message: 'Clinic space updated successfully',
      listing: updatedSpace
    });
  } catch (error) {
    console.error('Error updating clinic space:', error);
    res.status(500).json({ status: 'error', message: 'Failed to update clinic space' });
  }
});

app.delete('/clinic_spaces', authenticate, async (req, res) => {
  try {
    const { listingId } = req.body;
    
    if (!listingId) {
      return res.status(400).json({ status: 'error', message: 'Listing ID is required' });
    }
    
    // Check if space exists
    const spaceDoc = await admin.firestore().collection('clinic_spaces').doc(listingId).get();
    
    if (!spaceDoc.exists) {
      return res.status(404).json({ status: 'error', message: 'Space not found' });
    }
    
    const spaceData = spaceDoc.data();
    
    // Check if clinic exists and user is authorized
    const clinicDoc = await admin.firestore().collection('clinics_data').doc(spaceData?.clinicId).get();
    
    if (!clinicDoc.exists) {
      return res.status(404).json({ status: 'error', message: 'Clinic not found' });
    }
    
    const clinicData = clinicDoc.data();
    
    // Check if user is authorized (clinic owner or admin)
    if (req.user.uid !== clinicData?.ownerId && req.user.role !== 'ADMIN') {
      return res.status(403).json({ status: 'error', message: 'Unauthorized to delete spaces for this clinic' });
    }
    
    // Delete space
    await admin.firestore().collection('clinic_spaces').doc(listingId).delete();
    
    res.json({ 
      status: 'success', 
      message: 'Clinic space deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting clinic space:', error);
    res.status(500).json({ status: 'error', message: 'Failed to delete clinic space' });
  }
});

// User profile API
app.get('/user_profile', authenticate, async (req, res) => {
  try {
    const userId = req.user.uid;
    
    const userDoc = await admin.firestore().collection('users').doc(userId).get();
    
    if (!userDoc.exists) {
      return res.status(404).json({ status: 'error', message: 'User not found' });
    }
    
    const user = {
      id: userDoc.id,
      ...userDoc.data()
    };
    
    res.json({ status: 'success', user });
  } catch (error) {
    console.error('Error fetching user profile:', error);
    res.status(500).json({ status: 'error', message: 'Failed to fetch user profile' });
  }
});

app.put('/user_profile', authenticate, async (req, res) => {
  try {
    const userId = req.user.uid;
    const { name, email, profilePictureUrl } = req.body;
    
    const updateData: any = {};
    
    if (name !== undefined) updateData.name = name;
    if (email !== undefined) updateData.email = email;
    if (profilePictureUrl !== undefined) updateData.profilePictureUrl = profilePictureUrl;
    
    // Update user profile
    await admin.firestore().collection('users').doc(userId).update({
      ...updateData,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    // Get updated user profile
    const updatedDoc = await admin.firestore().collection('users').doc(userId).get();
    const user = {
      id: updatedDoc.id,
      ...updatedDoc.data()
    };
    
    res.json({ status: 'success', message: 'Profile updated successfully', user });
  } catch (error) {
    console.error('Error updating user profile:', error);
    res.status(500).json({ status: 'error', message: 'Failed to update user profile' });
  }
});

// Admin APIs
app.get('/admin_therapists', authenticate, async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'ADMIN') {
      return res.status(403).json({ status: 'error', message: 'Unauthorized. Admin role required.' });
    }
    
    const { status, searchTerm } = req.query;
    
    let query = admin.firestore().collection('therapists_data');
    
    if (status) {
      query = query.where('accountStatus', '==', status);
    }
    
    const snapshot = await query.get();
    
    let therapists = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    // Filter by search term if provided
    if (searchTerm) {
      therapists = therapists.filter(therapist => 
        therapist.name.toLowerCase().includes((searchTerm as string).toLowerCase()) ||
        therapist.email?.toLowerCase().includes((searchTerm as string).toLowerCase())
      );
    }
    
    res.json({ status: 'success', data: therapists });
  } catch (error) {
    console.error('Error fetching therapists for admin:', error);
    res.status(500).json({ status: 'error', message: 'Failed to fetch therapist data' });
  }
});

app.put('/admin_therapists', authenticate, async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'ADMIN') {
      return res.status(403).json({ status: 'error', message: 'Unauthorized. Admin role required.' });
    }
    
    const { id, status, adminNotes, isVerified } = req.body;
    
    if (!id) {
      return res.status(400).json({ status: 'error', message: 'Therapist ID is required' });
    }
    
    const updateData: any = {};
    
    if (status !== undefined) updateData.accountStatus = status;
    if (adminNotes !== undefined) updateData.adminNotes = adminNotes;
    if (isVerified !== undefined) updateData.isVerified = isVerified;
    
    // Update therapist profile
    await admin.firestore().collection('therapists_data').doc(id).update({
      ...updateData,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    // If status changed to 'live' or 'rejected', add membership history entry
    if (status === 'live' || status === 'rejected') {
      const therapistDoc = await admin.firestore().collection('therapists_data').doc(id).get();
      const therapistData = therapistDoc.data();
      
      const historyId = `mhist_ther_${Date.now()}`;
      const actionDescription = `Membership ${status === 'live' ? 'Approved' : 'Rejected'} by Admin.`;
      
      await admin.firestore().collection('membership_history').doc(historyId).set({
        id: historyId,
        targetId: id,
        targetType: 'THERAPIST',
        date: admin.firestore.FieldValue.serverTimestamp(),
        action: actionDescription,
        details: {
          previousStatus: therapistData?.accountStatus,
          newStatus: status,
          adminUserId: req.user.uid,
          adminName: req.user.name,
          notes: adminNotes
        }
      });
      
      // If approved, set renewal date if not already set
      if (status === 'live' && !therapistData?.membershipRenewalDate) {
        const renewalDate = new Date();
        renewalDate.setFullYear(renewalDate.getFullYear() + 1);
        
        await admin.firestore().collection('therapists_data').doc(id).update({
          membershipRenewalDate: renewalDate.toISOString()
        });
      }
    }
    
    // Get updated therapist profile
    const updatedDoc = await admin.firestore().collection('therapists_data').doc(id).get();
    const therapist = {
      id: updatedDoc.id,
      ...updatedDoc.data()
    };
    
    // Get certifications
    const certificationsSnapshot = await admin.firestore()
      .collection('certifications')
      .where('therapistUserId', '==', id)
      .get();
    
    const certifications = certificationsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    therapist.certifications = certifications;
    
    res.json({ status: 'success', message: 'Therapist profile updated successfully', therapist });
  } catch (error) {
    console.error('Error updating therapist for admin:', error);
    res.status(500).json({ status: 'error', message: 'Failed to update therapist data' });
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