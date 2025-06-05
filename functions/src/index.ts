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
    const { page = '1', limit = '20', searchTerm, specializations, languages, minRating, availability, locationSearch } = req.query;
    
    let query = admin.firestore().collection('therapists_data')
      .where('accountStatus', '==', 'live');
    
    // Apply filters
    if (searchTerm) {
      query = query.where('name', '>=', searchTerm)
                  .where('name', '<=', searchTerm + '\uf8ff');
    }
    
    if (minRating) {
      query = query.where('rating', '>=', parseFloat(minRating as string));
    }
    
    // Note: For array-contains queries like specializations, languages, and availability,
    // Firestore only allows one array-contains clause per query.
    // For multiple filters, we'll need to fetch and filter in memory.
    
    const snapshot = await query.get();
    
    let therapists = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    // Apply additional filters in memory
    if (specializations) {
      const specializationsList = (specializations as string).split(',');
      therapists = therapists.filter(therapist => 
        specializationsList.some(spec => 
          therapist.specializations && therapist.specializations.includes(spec)
        )
      );
    }
    
    if (languages) {
      const languagesList = (languages as string).split(',');
      therapists = therapists.filter(therapist => 
        languagesList.some(lang => 
          therapist.languages && therapist.languages.includes(lang)
        )
      );
    }
    
    if (availability) {
      const availabilityList = (availability as string).split(',');
      therapists = therapists.filter(therapist => 
        availabilityList.some(avail => 
          therapist.availability && therapist.availability.includes(avail)
        )
      );
    }
    
    if (locationSearch) {
      therapists = therapists.filter(therapist => {
        if (!therapist.locations || !therapist.locations.length) return false;
        return therapist.locations.some(location => 
          location.address && location.address.toLowerCase().includes((locationSearch as string).toLowerCase())
        );
      });
    }
    
    // Pagination
    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
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
    
    // Get certifications
    const certificationsSnapshot = await admin.firestore()
      .collection('certifications')
      .where('therapistUserId', '==', therapistId)
      .get();
    
    const certifications = certificationsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    // Add certifications to therapist object
    therapist.certifications = certifications;
    
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
app.get('/therapist_profile', async (req, res) => {
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
    
    // Add certifications to therapist object
    therapist.certifications = certifications;
    
    res.json({ status: 'success', therapist });
  } catch (error) {
    console.error('Error fetching therapist profile:', error);
    res.status(500).json({ status: 'error', message: 'Failed to fetch therapist profile' });
  }
});

app.put('/therapist_profile', authenticate, async (req, res) => {
  try {
    const userId = req.user.uid;
    const therapistData = req.body;
    
    // Ensure user can only update their own profile unless they're an admin
    if (req.user.role !== 'ADMIN' && userId !== therapistData.id) {
      return res.status(403).json({ status: 'error', message: 'Unauthorized to update this profile' });
    }
    
    // Remove certifications from data to update (they're handled separately)
    const { certifications, ...dataToUpdate } = therapistData;
    
    // Update therapist profile
    await admin.firestore().collection('therapists_data').doc(therapistData.id).update({
      ...dataToUpdate,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    // Fetch updated profile
    const updatedDoc = await admin.firestore().collection('therapists_data').doc(therapistData.id).get();
    const updatedTherapist = {
      id: updatedDoc.id,
      ...updatedDoc.data()
    };
    
    // Get certifications
    const certificationsSnapshot = await admin.firestore()
      .collection('certifications')
      .where('therapistUserId', '==', therapistData.id)
      .get();
    
    const updatedCertifications = certificationsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    // Add certifications to therapist object
    updatedTherapist.certifications = updatedCertifications;
    
    res.json({ status: 'success', message: 'Profile updated successfully', therapist: updatedTherapist });
  } catch (error) {
    console.error('Error updating therapist profile:', error);
    res.status(500).json({ status: 'error', message: 'Failed to update therapist profile' });
  }
});

// Therapist membership API
app.post('/therapist_membership', authenticate, async (req, res) => {
  try {
    const userId = req.user.uid;
    const { paymentReceiptUrl, applicationDate } = req.body;
    
    if (!paymentReceiptUrl) {
      return res.status(400).json({ status: 'error', message: 'Payment receipt URL is required' });
    }
    
    // Update therapist data
    await admin.firestore().collection('therapists_data').doc(userId).update({
      accountStatus: 'pending_approval',
      'membershipApplication.date': applicationDate || admin.firestore.FieldValue.serverTimestamp(),
      'membershipApplication.paymentReceiptUrl': paymentReceiptUrl,
      'membershipApplication.statusMessage': 'Application submitted, awaiting admin review.',
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    // Add membership history entry
    const historyId = `mhist_ther_${Date.now()}`;
    await admin.firestore().collection('membership_history').doc(historyId).set({
      id: historyId,
      targetId: userId,
      targetType: 'THERAPIST',
      date: applicationDate || admin.firestore.FieldValue.serverTimestamp(),
      action: 'Applied for Membership',
      details: {
        receiptUrl: paymentReceiptUrl,
        appliedBy: userId
      }
    });
    
    // Fetch updated therapist data
    const updatedDoc = await admin.firestore().collection('therapists_data').doc(userId).get();
    const updatedTherapist = {
      id: updatedDoc.id,
      ...updatedDoc.data()
    };
    
    res.json({ status: 'success', message: 'Membership application submitted successfully', therapist: updatedTherapist });
  } catch (error) {
    console.error('Error submitting membership application:', error);
    res.status(500).json({ status: 'error', message: 'Failed to submit membership application' });
  }
});

// Therapist membership history API
app.get('/therapist_membership_history', authenticate, async (req, res) => {
  try {
    const { userId } = req.query;
    
    if (!userId) {
      return res.status(400).json({ status: 'error', message: 'User ID is required' });
    }
    
    // Ensure user can only view their own history unless they're an admin
    if (req.user.role !== 'ADMIN' && req.user.uid !== userId) {
      return res.status(403).json({ status: 'error', message: 'Unauthorized to view this history' });
    }
    
    const historySnapshot = await admin.firestore()
      .collection('membership_history')
      .where('targetId', '==', userId)
      .where('targetType', '==', 'THERAPIST')
      .orderBy('date', 'desc')
      .get();
    
    const history = historySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    res.json({ status: 'success', history });
  } catch (error) {
    console.error('Error fetching membership history:', error);
    res.status(500).json({ status: 'error', message: 'Failed to fetch membership history' });
  }
});

// Therapist certifications API
app.post('/therapist_certifications', authenticate, async (req, res) => {
  try {
    const userId = req.user.uid;
    const { therapistId, name, fileUrl, country } = req.body;
    
    // Ensure user can only add certifications to their own profile unless they're an admin
    if (req.user.role !== 'ADMIN' && userId !== therapistId) {
      return res.status(403).json({ status: 'error', message: 'Unauthorized to add certification to this profile' });
    }
    
    if (!name || !fileUrl) {
      return res.status(400).json({ status: 'error', message: 'Certification name and file URL are required' });
    }
    
    // Create certification
    const certId = `cert_${Date.now()}`;
    await admin.firestore().collection('certifications').doc(certId).set({
      id: certId,
      therapistUserId: therapistId,
      name,
      fileUrl,
      country: country || null,
      isVerified: false,
      verificationNotes: null,
      uploadedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    // Fetch updated therapist data with certifications
    const therapistDoc = await admin.firestore().collection('therapists_data').doc(therapistId).get();
    const certificationsSnapshot = await admin.firestore()
      .collection('certifications')
      .where('therapistUserId', '==', therapistId)
      .get();
    
    const therapist = {
      id: therapistDoc.id,
      ...therapistDoc.data(),
      certifications: certificationsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }))
    };
    
    res.json({ status: 'success', message: 'Certification added successfully', therapist });
  } catch (error) {
    console.error('Error adding certification:', error);
    res.status(500).json({ status: 'error', message: 'Failed to add certification' });
  }
});

app.put('/therapist_certifications', authenticate, async (req, res) => {
  try {
    const userId = req.user.uid;
    const { id, therapistUserId, name, country, isVerifiedByAdmin, verificationNotes } = req.body;
    
    // Fetch the certification to check ownership
    const certDoc = await admin.firestore().collection('certifications').doc(id).get();
    
    if (!certDoc.exists) {
      return res.status(404).json({ status: 'error', message: 'Certification not found' });
    }
    
    const certData = certDoc.data();
    
    // Ensure user can only update their own certifications unless they're an admin
    if (req.user.role !== 'ADMIN' && userId !== certData.therapistUserId) {
      return res.status(403).json({ status: 'error', message: 'Unauthorized to update this certification' });
    }
    
    // Prepare update data
    const updateData: any = {};
    
    if (name !== undefined && (req.user.role === 'ADMIN' || userId === certData.therapistUserId)) {
      updateData.name = name;
    }
    
    if (country !== undefined && (req.user.role === 'ADMIN' || userId === certData.therapistUserId)) {
      updateData.country = country;
    }
    
    if (isVerifiedByAdmin !== undefined && req.user.role === 'ADMIN') {
      updateData.isVerified = isVerifiedByAdmin;
    }
    
    if (verificationNotes !== undefined && req.user.role === 'ADMIN') {
      updateData.verificationNotes = verificationNotes;
    }
    
    // Update certification
    await admin.firestore().collection('certifications').doc(id).update(updateData);
    
    // Fetch updated therapist data with certifications
    const therapistDoc = await admin.firestore().collection('therapists_data').doc(therapistUserId).get();
    const certificationsSnapshot = await admin.firestore()
      .collection('certifications')
      .where('therapistUserId', '==', therapistUserId)
      .get();
    
    const therapist = {
      id: therapistDoc.id,
      ...therapistDoc.data(),
      certifications: certificationsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }))
    };
    
    res.json({ status: 'success', message: 'Certification updated successfully', therapist });
  } catch (error) {
    console.error('Error updating certification:', error);
    res.status(500).json({ status: 'error', message: 'Failed to update certification' });
  }
});

app.delete('/therapist_certifications', authenticate, async (req, res) => {
  try {
    const userId = req.user.uid;
    const { certId, therapistId } = req.body;
    
    // Fetch the certification to check ownership
    const certDoc = await admin.firestore().collection('certifications').doc(certId).get();
    
    if (!certDoc.exists) {
      return res.status(404).json({ status: 'error', message: 'Certification not found' });
    }
    
    const certData = certDoc.data();
    
    // Ensure user can only delete their own certifications unless they're an admin
    if (req.user.role !== 'ADMIN' && userId !== certData.therapistUserId) {
      return res.status(403).json({ status: 'error', message: 'Unauthorized to delete this certification' });
    }
    
    // Delete certification
    await admin.firestore().collection('certifications').doc(certId).delete();
    
    // Fetch updated therapist data with certifications
    const therapistDoc = await admin.firestore().collection('therapists_data').doc(therapistId).get();
    const certificationsSnapshot = await admin.firestore()
      .collection('certifications')
      .where('therapistUserId', '==', therapistId)
      .get();
    
    const therapist = {
      id: therapistDoc.id,
      ...therapistDoc.data(),
      certifications: certificationsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }))
    };
    
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
    
    // Get clinic spaces
    const spacesSnapshot = await admin.firestore()
      .collection('clinic_spaces')
      .where('clinicId', '==', clinic.id)
      .get();
    
    const spaces = spacesSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    // Add spaces to clinic object
    clinic.listings = spaces;
    
    // Get owner info
    const ownerDoc = await admin.firestore().collection('users').doc(clinic.ownerId).get();
    
    if (ownerDoc.exists) {
      clinic.ownerName = ownerDoc.data().name;
      clinic.ownerEmail = ownerDoc.data().email;
    }
    
    res.json({ status: 'success', clinic });
  } catch (error) {
    console.error('Error fetching clinic profile:', error);
    res.status(500).json({ status: 'error', message: 'Failed to fetch clinic profile' });
  }
});

app.put('/clinic_profile', authenticate, async (req, res) => {
  try {
    const userId = req.user.uid;
    const clinicData = req.body;
    
    // Ensure user can only update their own clinic unless they're an admin
    if (req.user.role !== 'ADMIN' && userId !== clinicData.ownerId) {
      return res.status(403).json({ status: 'error', message: 'Unauthorized to update this clinic' });
    }
    
    // Remove listings from data to update (they're handled separately)
    const { listings, ...dataToUpdate } = clinicData;
    
    // Update clinic profile
    await admin.firestore().collection('clinics_data').doc(clinicData.id).update({
      ...dataToUpdate,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    // Fetch updated profile
    const updatedDoc = await admin.firestore().collection('clinics_data').doc(clinicData.id).get();
    
    // Get clinic spaces
    const spacesSnapshot = await admin.firestore()
      .collection('clinic_spaces')
      .where('clinicId', '==', clinicData.id)
      .get();
    
    const spaces = spacesSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    // Get owner info
    const ownerDoc = await admin.firestore().collection('users').doc(updatedDoc.data().ownerId).get();
    
    const updatedClinic = {
      id: updatedDoc.id,
      ...updatedDoc.data(),
      listings: spaces
    };
    
    if (ownerDoc.exists) {
      updatedClinic.ownerName = ownerDoc.data().name;
      updatedClinic.ownerEmail = ownerDoc.data().email;
    }
    
    res.json({ status: 'success', message: 'Clinic profile updated successfully', clinic: updatedClinic });
  } catch (error) {
    console.error('Error updating clinic profile:', error);
    res.status(500).json({ status: 'error', message: 'Failed to update clinic profile' });
  }
});

// Clinic membership API
app.post('/clinic_membership', authenticate, async (req, res) => {
  try {
    const userId = req.user.uid;
    const { clinicId, paymentReceiptUrl, applicationDate } = req.body;
    
    // Verify ownership
    const clinicDoc = await admin.firestore().collection('clinics_data').doc(clinicId).get();
    
    if (!clinicDoc.exists) {
      return res.status(404).json({ status: 'error', message: 'Clinic not found' });
    }
    
    if (clinicDoc.data().ownerId !== userId && req.user.role !== 'ADMIN') {
      return res.status(403).json({ status: 'error', message: 'Unauthorized to manage this clinic\'s membership' });
    }
    
    if (!paymentReceiptUrl) {
      return res.status(400).json({ status: 'error', message: 'Payment receipt URL is required' });
    }
    
    // Update clinic data
    await admin.firestore().collection('clinics_data').doc(clinicId).update({
      accountStatus: 'pending_approval',
      'theraWayMembership.status': 'pending_approval',
      'theraWayMembership.applicationDate': applicationDate || admin.firestore.FieldValue.serverTimestamp(),
      'theraWayMembership.paymentReceiptUrl': paymentReceiptUrl,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    // Add membership history entry
    const historyId = `mhist_clinic_${Date.now()}`;
    await admin.firestore().collection('membership_history').doc(historyId).set({
      id: historyId,
      targetId: clinicId,
      targetType: 'CLINIC',
      date: applicationDate || admin.firestore.FieldValue.serverTimestamp(),
      action: 'Applied for Membership',
      details: {
        receiptUrl: paymentReceiptUrl,
        appliedByOwnerId: userId
      }
    });
    
    // Fetch updated clinic data
    const updatedDoc = await admin.firestore().collection('clinics_data').doc(clinicId).get();
    
    // Get clinic spaces
    const spacesSnapshot = await admin.firestore()
      .collection('clinic_spaces')
      .where('clinicId', '==', clinicId)
      .get();
    
    const spaces = spacesSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    // Get owner info
    const ownerDoc = await admin.firestore().collection('users').doc(updatedDoc.data().ownerId).get();
    
    const updatedClinic = {
      id: updatedDoc.id,
      ...updatedDoc.data(),
      listings: spaces
    };
    
    if (ownerDoc.exists) {
      updatedClinic.ownerName = ownerDoc.data().name;
      updatedClinic.ownerEmail = ownerDoc.data().email;
    }
    
    res.json({ status: 'success', message: 'Membership application submitted successfully', clinic: updatedClinic });
  } catch (error) {
    console.error('Error submitting membership application:', error);
    res.status(500).json({ status: 'error', message: 'Failed to submit membership application' });
  }
});

// Clinic membership history API
app.get('/clinic_membership_history', authenticate, async (req, res) => {
  try {
    const { clinicId } = req.query;
    
    if (!clinicId) {
      return res.status(400).json({ status: 'error', message: 'Clinic ID is required' });
    }
    
    // Verify authorization
    if (req.user.role !== 'ADMIN') {
      const clinicDoc = await admin.firestore().collection('clinics_data').doc(clinicId as string).get();
      
      if (!clinicDoc.exists || clinicDoc.data().ownerId !== req.user.uid) {
        return res.status(403).json({ status: 'error', message: 'Unauthorized to view this clinic\'s membership history' });
      }
    }
    
    const historySnapshot = await admin.firestore()
      .collection('membership_history')
      .where('targetId', '==', clinicId)
      .where('targetType', '==', 'CLINIC')
      .orderBy('date', 'desc')
      .get();
    
    const history = historySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    res.json({ status: 'success', history });
  } catch (error) {
    console.error('Error fetching membership history:', error);
    res.status(500).json({ status: 'error', message: 'Failed to fetch membership history' });
  }
});

// Clinic spaces API
app.get('/clinic_spaces', async (req, res) => {
  try {
    const { clinicId, location, minPrice, maxPrice, features, page = '1', limit = '10' } = req.query;
    
    let query = admin.firestore().collection('clinic_spaces');
    
    if (clinicId) {
      // If clinicId is provided, fetch spaces for that specific clinic
      query = query.where('clinicId', '==', clinicId);
    } else {
      // For public browsing, join with clinics_data to ensure we only show spaces from 'live' clinics
      // This is a client-side join since Firestore doesn't support joins
      const liveClinicIds = (await admin.firestore()
        .collection('clinics_data')
        .where('accountStatus', '==', 'live')
        .get()).docs.map(doc => doc.id);
      
      // Filter spaces by live clinic IDs
      if (liveClinicIds.length === 0) {
        return res.json({
          status: 'success',
          spaces: [],
          pagination: {
            currentPage: 1,
            totalPages: 0,
            totalItems: 0,
            itemsPerPage: parseInt(limit as string)
          }
        });
      }
    }
    
    // Apply filters
    if (minPrice) {
      query = query.where('rentalPrice', '>=', parseFloat(minPrice as string));
    }
    
    if (maxPrice) {
      query = query.where('rentalPrice', '<=', parseFloat(maxPrice as string));
    }
    
    // Execute query
    const snapshot = await query.get();
    
    let spaces = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    // Apply additional filters in memory
    if (location) {
      spaces = spaces.filter(space => {
        const searchTerm = (location as string).toLowerCase();
        return (
          (space.name && space.name.toLowerCase().includes(searchTerm)) ||
          (space.description && space.description.toLowerCase().includes(searchTerm)) ||
          (space.clinicAddress && space.clinicAddress.toLowerCase().includes(searchTerm))
        );
      });
    }
    
    if (features) {
      const featuresList = (features as string).split(',');
      spaces = spaces.filter(space => 
        featuresList.some(feature => 
          space.features && space.features.includes(feature)
        )
      );
    }
    
    // If we're not filtering by clinicId, filter by live clinics
    if (!clinicId) {
      const liveClinicIds = (await admin.firestore()
        .collection('clinics_data')
        .where('accountStatus', '==', 'live')
        .get()).docs.map(doc => doc.id);
      
      spaces = spaces.filter(space => liveClinicIds.includes(space.clinicId));
    }
    
    // Pagination
    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
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
    const userId = req.user.uid;
    const spaceData = req.body;
    
    // Verify ownership
    const clinicDoc = await admin.firestore().collection('clinics_data').doc(spaceData.clinicId).get();
    
    if (!clinicDoc.exists) {
      return res.status(404).json({ status: 'error', message: 'Clinic not found' });
    }
    
    if (clinicDoc.data().ownerId !== userId && req.user.role !== 'ADMIN') {
      return res.status(403).json({ status: 'error', message: 'Unauthorized to add spaces to this clinic' });
    }
    
    // Create space
    const spaceId = `space_${Date.now()}`;
    await admin.firestore().collection('clinic_spaces').doc(spaceId).set({
      ...spaceData,
      id: spaceId,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    // Fetch created space
    const spaceDoc = await admin.firestore().collection('clinic_spaces').doc(spaceId).get();
    
    res.json({ status: 'success', message: 'Clinic space added successfully', listing: { id: spaceDoc.id, ...spaceDoc.data() } });
  } catch (error) {
    console.error('Error adding clinic space:', error);
    res.status(500).json({ status: 'error', message: 'Failed to add clinic space' });
  }
});

app.put('/clinic_spaces', authenticate, async (req, res) => {
  try {
    const userId = req.user.uid;
    const spaceData = req.body;
    
    // Verify ownership
    const spaceDoc = await admin.firestore().collection('clinic_spaces').doc(spaceData.id).get();
    
    if (!spaceDoc.exists) {
      return res.status(404).json({ status: 'error', message: 'Space not found' });
    }
    
    const clinicId = spaceDoc.data().clinicId;
    const clinicDoc = await admin.firestore().collection('clinics_data').doc(clinicId).get();
    
    if (!clinicDoc.exists) {
      return res.status(404).json({ status: 'error', message: 'Clinic not found' });
    }
    
    if (clinicDoc.data().ownerId !== userId && req.user.role !== 'ADMIN') {
      return res.status(403).json({ status: 'error', message: 'Unauthorized to update this space' });
    }
    
    // Update space
    await admin.firestore().collection('clinic_spaces').doc(spaceData.id).update({
      ...spaceData,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    // Fetch updated space
    const updatedDoc = await admin.firestore().collection('clinic_spaces').doc(spaceData.id).get();
    
    res.json({ status: 'success', message: 'Clinic space updated successfully', listing: { id: updatedDoc.id, ...updatedDoc.data() } });
  } catch (error) {
    console.error('Error updating clinic space:', error);
    res.status(500).json({ status: 'error', message: 'Failed to update clinic space' });
  }
});

app.delete('/clinic_spaces', authenticate, async (req, res) => {
  try {
    const userId = req.user.uid;
    const { listingId } = req.body;
    
    // Verify ownership
    const spaceDoc = await admin.firestore().collection('clinic_spaces').doc(listingId).get();
    
    if (!spaceDoc.exists) {
      return res.status(404).json({ status: 'error', message: 'Space not found' });
    }
    
    const clinicId = spaceDoc.data().clinicId;
    const clinicDoc = await admin.firestore().collection('clinics_data').doc(clinicId).get();
    
    if (!clinicDoc.exists) {
      return res.status(404).json({ status: 'error', message: 'Clinic not found' });
    }
    
    if (clinicDoc.data().ownerId !== userId && req.user.role !== 'ADMIN') {
      return res.status(403).json({ status: 'error', message: 'Unauthorized to delete this space' });
    }
    
    // Delete space
    await admin.firestore().collection('clinic_spaces').doc(listingId).delete();
    
    res.json({ status: 'success', message: 'Clinic space deleted successfully' });
  } catch (error) {
    console.error('Error deleting clinic space:', error);
    res.status(500).json({ status: 'error', message: 'Failed to delete clinic space' });
  }
});

// Clinics general listing API
app.get('/clinics', async (req, res) => {
  try {
    const { page = '1', limit = '20', searchTerm } = req.query;
    
    let query = admin.firestore().collection('clinics_data')
      .where('accountStatus', '==', 'live');
    
    // Apply search filter
    if (searchTerm) {
      query = query.where('name', '>=', searchTerm)
                  .where('name', '<=', searchTerm + '\uf8ff');
    }
    
    const snapshot = await query.get();
    
    let clinics = snapshot.docs.map(doc => {
      const data = doc.data();
      // Return only summary fields for listing
      return {
        id: doc.id,
        name: data.name,
        address: data.address,
        profilePictureUrl: data.profilePictureUrl,
        description: data.description,
        ownerName: data.ownerName
      };
    });
    
    // Pagination
    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const startIndex = (pageNum - 1) * limitNum;
    const endIndex = pageNum * limitNum;
    
    const paginatedClinics = clinics.slice(startIndex, endIndex);
    
    res.json({
      status: 'success',
      clinics: paginatedClinics,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(clinics.length / limitNum),
        totalItems: clinics.length,
        itemsPerPage: limitNum
      }
    });
  } catch (error) {
    console.error('Error fetching clinics:', error);
    res.status(500).json({ status: 'error', message: 'Failed to fetch clinics' });
  }
});

// Clinic analytics API
app.get('/clinic_analytics', authenticate, async (req, res) => {
  try {
    const userId = req.user.uid;
    const { clinicId } = req.query;
    
    if (!clinicId) {
      return res.status(400).json({ status: 'error', message: 'Clinic ID is required' });
    }
    
    // Verify authorization
    if (req.user.role !== 'ADMIN') {
      const clinicDoc = await admin.firestore().collection('clinics_data').doc(clinicId as string).get();
      
      if (!clinicDoc.exists || clinicDoc.data().ownerId !== userId) {
        return res.status(403).json({ status: 'error', message: 'Unauthorized to view analytics for this clinic' });
      }
    }
    
    // Get clinic data
    const clinicDoc = await admin.firestore().collection('clinics_data').doc(clinicId as string).get();
    
    if (!clinicDoc.exists) {
      return res.status(404).json({ status: 'error', message: 'Clinic not found' });
    }
    
    // Get profile views from activity logs
    const viewsSnapshot = await admin.firestore()
      .collection('activity_logs')
      .where('targetId', '==', clinicId)
      .where('targetType', '==', 'clinic')
      .where('action', '==', 'VIEW_CLINIC_PROFILE')
      .get();
    
    const profileViews = viewsSnapshot.size;
    
    // Get space listings
    const spacesSnapshot = await admin.firestore()
      .collection('clinic_spaces')
      .where('clinicId', '==', clinicId)
      .get();
    
    const totalSpaceListings = spacesSnapshot.size;
    
    // Calculate average rental price
    let totalPrice = 0;
    spacesSnapshot.forEach(doc => {
      totalPrice += doc.data().rentalPrice || 0;
    });
    
    const averageSpaceRentalPrice = totalSpaceListings > 0 ? totalPrice / totalSpaceListings : null;
    
    // Get most common features
    const allFeatures: string[] = [];
    spacesSnapshot.forEach(doc => {
      const features = doc.data().features || [];
      allFeatures.push(...features);
    });
    
    const featureCounts: Record<string, number> = {};
    allFeatures.forEach(feature => {
      featureCounts[feature] = (featureCounts[feature] || 0) + 1;
    });
    
    const mostCommonFeatures = Object.entries(featureCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([feature]) => feature);
    
    // Create analytics object
    const analytics = {
      clinicId: clinicId as string,
      clinicName: clinicDoc.data().name,
      profileViews,
      totalSpaceListings,
      averageSpaceRentalPrice,
      mostCommonFeatures,
      therapistConnections: 'N/A (Advanced Feature)',
      inquiriesViaProfile: 'N/A (Advanced Feature)',
      engagementRate: 'N/A (Advanced Feature)',
      revenueGenerated: null,
      upcomingBookings: 0,
      peakHoursDemand: {},
      dataLastUpdated: new Date().toISOString()
    };
    
    res.json({ status: 'success', analytics });
  } catch (error) {
    console.error('Error fetching clinic analytics:', error);
    res.status(500).json({ status: 'error', message: 'Failed to fetch clinic analytics' });
  }
});

// Admin endpoints
// Admin: Therapists
app.get('/admin_therapists', authenticate, async (req, res) => {
  try {
    // Ensure user is an admin
    if (req.user.role !== 'ADMIN') {
      return res.status(403).json({ status: 'error', message: 'Access denied. Admin role required.' });
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
    
    // Apply search filter in memory
    if (searchTerm) {
      const term = (searchTerm as string).toLowerCase();
      therapists = therapists.filter(therapist => 
        (therapist.name && therapist.name.toLowerCase().includes(term)) ||
        (therapist.email && therapist.email.toLowerCase().includes(term))
      );
    }
    
    // Fetch certifications for each therapist
    for (const therapist of therapists) {
      const certificationsSnapshot = await admin.firestore()
        .collection('certifications')
        .where('therapistUserId', '==', therapist.id)
        .get();
      
      therapist.certifications = certificationsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    }
    
    res.json({ status: 'success', data: therapists });
  } catch (error) {
    console.error('Error fetching therapists for admin:', error);
    res.status(500).json({ status: 'error', message: 'Failed to fetch therapist data.' });
  }
});

app.put('/admin_therapists', authenticate, async (req, res) => {
  try {
    // Ensure user is an admin
    if (req.user.role !== 'ADMIN') {
      return res.status(403).json({ status: 'error', message: 'Access denied. Admin role required.' });
    }
    
    const { id, status, adminNotes, isVerified } = req.body;
    
    if (!id) {
      return res.status(400).json({ status: 'error', message: 'Therapist ID is required.' });
    }
    
    // Fetch current therapist data
    const therapistDoc = await admin.firestore().collection('therapists_data').doc(id).get();
    
    if (!therapistDoc.exists) {
      return res.status(404).json({ status: 'error', message: 'Therapist not found.' });
    }
    
    const currentStatus = therapistDoc.data().accountStatus;
    
    // Prepare update data
    const updateData: any = {};
    
    if (status) {
      updateData.accountStatus = status;
    }
    
    if (adminNotes !== undefined) {
      updateData.adminNotes = adminNotes;
    }
    
    if (isVerified !== undefined) {
      updateData.isVerified = isVerified;
    }
    
    updateData.updatedAt = admin.firestore.FieldValue.serverTimestamp();
    
    // Update therapist data
    await admin.firestore().collection('therapists_data').doc(id).update(updateData);
    
    // If status changed to 'live' or 'rejected', add membership history entry
    if (status && (status === 'live' || status === 'rejected') && status !== currentStatus) {
      const historyId = `mhist_ther_${Date.now()}`;
      const actionDescription = `Membership ${status === 'live' ? 'Approved' : 'Rejected'} by Admin.`;
      
      await admin.firestore().collection('membership_history').doc(historyId).set({
        id: historyId,
        targetId: id,
        targetType: 'THERAPIST',
        date: admin.firestore.FieldValue.serverTimestamp(),
        action: actionDescription,
        details: {
          previousStatus: currentStatus,
          newStatus: status,
          adminUserId: req.user.uid,
          adminName: req.user.name || 'Admin',
          notes: adminNotes
        }
      });
      
      // If approved, set renewal date if not already set
      if (status === 'live') {
        const oneYearFromNow = new Date();
        oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);
        
        await admin.firestore().collection('therapists_data').doc(id).update({
          membershipRenewalDate: oneYearFromNow.toISOString()
        });
      }
    }
    
    // Fetch updated therapist data with certifications
    const updatedDoc = await admin.firestore().collection('therapists_data').doc(id).get();
    const certificationsSnapshot = await admin.firestore()
      .collection('certifications')
      .where('therapistUserId', '==', id)
      .get();
    
    const updatedTherapist = {
      id: updatedDoc.id,
      ...updatedDoc.data(),
      certifications: certificationsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }))
    };
    
    res.json({ status: 'success', message: 'Therapist profile updated successfully.', therapist: updatedTherapist });
  } catch (error) {
    console.error('Error updating therapist for admin:', error);
    res.status(500).json({ status: 'error', message: 'A server error occurred while updating therapist data.' });
  }
});

// Admin: Clinics
app.get('/admin_clinics', authenticate, async (req, res) => {
  try {
    // Ensure user is an admin
    if (req.user.role !== 'ADMIN') {
      return res.status(403).json({ status: 'error', message: 'Access denied. Admin role required.' });
    }
    
    const { status, searchTerm } = req.query;
    
    let query = admin.firestore().collection('clinics_data');
    
    if (status) {
      query = query.where('accountStatus', '==', status);
    }
    
    const snapshot = await query.get();
    
    let clinics = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    // Apply search filter in memory
    if (searchTerm) {
      const term = (searchTerm as string).toLowerCase();
      clinics = clinics.filter(clinic => 
        (clinic.name && clinic.name.toLowerCase().includes(term)) ||
        (clinic.id && clinic.id.includes(term))
      );
    }
    
    // Fetch owner info for each clinic
    for (const clinic of clinics) {
      const ownerDoc = await admin.firestore().collection('users').doc(clinic.ownerId).get();
      
      if (ownerDoc.exists) {
        clinic.ownerName = ownerDoc.data().name;
        clinic.ownerEmail = ownerDoc.data().email;
      }
    }
    
    res.json({ status: 'success', data: clinics });
  } catch (error) {
    console.error('Error fetching clinics for admin:', error);
    res.status(500).json({ status: 'error', message: 'Failed to fetch clinic data.' });
  }
});

app.put('/admin_clinics', authenticate, async (req, res) => {
  try {
    // Ensure user is an admin
    if (req.user.role !== 'ADMIN') {
      return res.status(403).json({ status: 'error', message: 'Access denied. Admin role required.' });
    }
    
    const { id, status, adminNotes, isVerified } = req.body;
    
    if (!id) {
      return res.status(400).json({ status: 'error', message: 'Clinic ID is required.' });
    }
    
    // Fetch current clinic data
    const clinicDoc = await admin.firestore().collection('clinics_data').doc(id).get();
    
    if (!clinicDoc.exists) {
      return res.status(404).json({ status: 'error', message: 'Clinic not found.' });
    }
    
    const currentStatus = clinicDoc.data().accountStatus;
    
    // Prepare update data
    const updateData: any = {};
    
    if (status) {
      updateData.accountStatus = status;
    }
    
    if (adminNotes !== undefined) {
      updateData.adminNotes = adminNotes;
    }
    
    if (isVerified !== undefined) {
      updateData.isVerified = isVerified;
    }
    
    updateData.updatedAt = admin.firestore.FieldValue.serverTimestamp();
    
    // Update clinic data
    await admin.firestore().collection('clinics_data').doc(id).update(updateData);
    
    // If status changed to 'live' or 'rejected', add membership history entry
    if (status && (status === 'live' || status === 'rejected') && status !== currentStatus) {
      const historyId = `mhist_clinic_${Date.now()}`;
      const actionDescription = `Clinic Membership ${status === 'live' ? 'Approved' : 'Rejected'} by Admin.`;
      
      await admin.firestore().collection('membership_history').doc(historyId).set({
        id: historyId,
        targetId: id,
        targetType: 'CLINIC',
        date: admin.firestore.FieldValue.serverTimestamp(),
        action: actionDescription,
        details: {
          previousStatus: currentStatus,
          newStatus: status,
          adminUserId: req.user.uid,
          adminName: req.user.name || 'Admin',
          notes: adminNotes
        }
      });
      
      // If approved, set renewal date and update membership status
      if (status === 'live') {
        const oneYearFromNow = new Date();
        oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);
        
        await admin.firestore().collection('clinics_data').doc(id).update({
          'theraWayMembership.renewalDate': oneYearFromNow.toISOString(),
          'theraWayMembership.status': 'active'
        });
      }
    }
    
    // Fetch updated clinic data
    const updatedDoc = await admin.firestore().collection('clinics_data').doc(id).get();
    
    // Get clinic spaces
    const spacesSnapshot = await admin.firestore()
      .collection('clinic_spaces')
      .where('clinicId', '==', id)
      .get();
    
    const spaces = spacesSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    // Get owner info
    const ownerDoc = await admin.firestore().collection('users').doc(updatedDoc.data().ownerId).get();
    
    const updatedClinic = {
      id: updatedDoc.id,
      ...updatedDoc.data(),
      listings: spaces
    };
    
    if (ownerDoc.exists) {
      updatedClinic.ownerName = ownerDoc.data().name;
      updatedClinic.ownerEmail = ownerDoc.data().email;
    }
    
    res.json({ status: 'success', message: 'Clinic profile updated successfully.', clinic: updatedClinic });
  } catch (error) {
    console.error('Error updating clinic for admin:', error);
    res.status(500).json({ status: 'error', message: 'A server error occurred while updating clinic data.' });
  }
});

// Admin: User Inquiries
app.get('/admin_inquiries', authenticate, async (req, res) => {
  try {
    // Ensure user is an admin
    if (req.user.role !== 'ADMIN') {
      return res.status(403).json({ status: 'error', message: 'Access denied. Admin role required.' });
    }
    
    const { status, searchTerm } = req.query;
    
    let query = admin.firestore().collection('user_inquiries');
    
    if (status && status !== 'all') {
      query = query.where('status', '==', status);
    }
    
    const snapshot = await query.orderBy('date', 'desc').get();
    
    let inquiries = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    // Apply search filter in memory
    if (searchTerm) {
      const term = (searchTerm as string).toLowerCase();
      inquiries = inquiries.filter(inquiry => 
        (inquiry.subject && inquiry.subject.toLowerCase().includes(term)) ||
        (inquiry.message && inquiry.message.toLowerCase().includes(term)) ||
        (inquiry.userEmail && inquiry.userEmail.toLowerCase().includes(term)) ||
        (inquiry.userName && inquiry.userName.toLowerCase().includes(term))
      );
    }
    
    res.json({ status: 'success', data: inquiries });
  } catch (error) {
    console.error('Error fetching inquiries for admin:', error);
    res.status(500).json({ status: 'error', message: 'Failed to fetch inquiries.' });
  }
});

app.put('/admin_inquiries', authenticate, async (req, res) => {
  try {
    // Ensure user is an admin
    if (req.user.role !== 'ADMIN') {
      return res.status(403).json({ status: 'error', message: 'Access denied. Admin role required.' });
    }
    
    const { id, status, adminReply, priority } = req.body;
    
    if (!id) {
      return res.status(400).json({ status: 'error', message: 'Inquiry ID is required.' });
    }
    
    // Fetch current inquiry
    const inquiryDoc = await admin.firestore().collection('user_inquiries').doc(id).get();
    
    if (!inquiryDoc.exists) {
      return res.status(404).json({ status: 'error', message: 'Inquiry not found.' });
    }
    
    // Prepare update data
    const updateData: any = {};
    
    if (status) {
      updateData.status = status;
    }
    
    if (adminReply !== undefined) {
      updateData.adminReply = adminReply;
    }
    
    if (priority) {
      updateData.priority = priority;
    }
    
    // Update inquiry
    await admin.firestore().collection('user_inquiries').doc(id).update(updateData);
    
    // Fetch updated inquiry
    const updatedDoc = await admin.firestore().collection('user_inquiries').doc(id).get();
    
    res.json({ status: 'success', message: 'Inquiry updated successfully.', inquiry: { id: updatedDoc.id, ...updatedDoc.data() } });
  } catch (error) {
    console.error('Error updating inquiry:', error);
    res.status(500).json({ status: 'error', message: 'A server error occurred while updating the inquiry.' });
  }
});

// Admin: Activity Log
app.get('/admin_activitylog', authenticate, async (req, res) => {
  try {
    // Ensure user is an admin
    if (req.user.role !== 'ADMIN') {
      return res.status(403).json({ status: 'error', message: 'Access denied. Admin role required.' });
    }
    
    const { action, user } = req.query;
    
    let query = admin.firestore().collection('activity_logs');
    
    // Apply filters
    if (action) {
      query = query.where('action', '==', action);
    }
    
    // Note: Filtering by user requires a composite index in Firestore
    // For simplicity, we'll filter by user in memory
    
    const snapshot = await query.orderBy('timestamp', 'desc').get();
    
    let logs = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    // Apply user filter in memory
    if (user) {
      const term = (user as string).toLowerCase();
      logs = logs.filter(log => 
        (log.userId && log.userId.toLowerCase().includes(term)) ||
        (log.userName && log.userName.toLowerCase().includes(term))
      );
    }
    
    res.json({ status: 'success', data: logs });
  } catch (error) {
    console.error('Error fetching activity logs for admin:', error);
    res.status(500).json({ status: 'error', message: 'Failed to fetch activity logs.' });
  }
});

app.post('/admin_activitylog', authenticate, async (req, res) => {
  try {
    // Ensure user is an admin
    if (req.user.role !== 'ADMIN') {
      return res.status(403).json({ status: 'error', message: 'Access denied. Admin role required.' });
    }
    
    const { action, targetId, targetType, details } = req.body;
    
    if (!action) {
      return res.status(400).json({ status: 'error', message: 'Action description is required.' });
    }
    
    // Create log entry
    const logId = `alog_${Date.now()}`;
    const logData = {
      id: logId,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      userId: req.user.uid,
      userName: req.user.name || 'Admin',
      userRole: 'ADMIN',
      action,
      targetId: targetId || null,
      targetType: targetType || null,
      details: details || null
    };
    
    await admin.firestore().collection('activity_logs').doc(logId).set(logData);
    
    // Fetch created log
    const logDoc = await admin.firestore().collection('activity_logs').doc(logId).get();
    
    res.json({ status: 'success', message: 'Activity log entry added.', log: { id: logDoc.id, ...logDoc.data() } });
  } catch (error) {
    console.error('Error adding activity log:', error);
    res.status(500).json({ status: 'error', message: 'Failed to add activity log entry.' });
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

// Therapist profile view counter
export const incrementTherapistProfileViews = functions.https.onCall(async (data, context) => {
  try {
    const { therapistId } = data;
    
    if (!therapistId) {
      throw new functions.https.HttpsError('invalid-argument', 'Therapist ID is required');
    }
    
    // Increment profile views
    await admin.firestore().collection('therapists_data').doc(therapistId).update({
      profileViews: admin.firestore.FieldValue.increment(1)
    });
    
    // Add activity log
    const logId = `alog_${Date.now()}`;
    const logData = {
      id: logId,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      userId: context.auth?.uid || null,
      userName: context.auth?.token.name || null,
      userRole: context.auth?.token.role || null,
      action: 'VIEW_PROFILE',
      targetId: therapistId,
      targetType: 'therapist',
      details: null
    };
    
    await admin.firestore().collection('activity_logs').doc(logId).set(logData);
    
    return { success: true };
  } catch (error) {
    console.error('Error incrementing profile views:', error);
    throw new functions.https.HttpsError('internal', 'Failed to increment profile views');
  }
});

// Clinic profile view counter
export const incrementClinicProfileViews = functions.https.onCall(async (data, context) => {
  try {
    const { clinicId } = data;
    
    if (!clinicId) {
      throw new functions.https.HttpsError('invalid-argument', 'Clinic ID is required');
    }
    
    // Add activity log
    const logId = `alog_${Date.now()}`;
    const logData = {
      id: logId,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      userId: context.auth?.uid || null,
      userName: context.auth?.token.name || null,
      userRole: context.auth?.token.role || null,
      action: 'VIEW_CLINIC_PROFILE',
      targetId: clinicId,
      targetType: 'clinic',
      details: null
    };
    
    await admin.firestore().collection('activity_logs').doc(logId).set(logData);
    
    return { success: true };
  } catch (error) {
    console.error('Error logging clinic profile view:', error);
    throw new functions.https.HttpsError('internal', 'Failed to log clinic profile view');
  }
});