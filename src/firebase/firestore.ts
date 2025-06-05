import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  where, 
  orderBy, 
  limit,
  startAfter,
  DocumentData,
  QueryDocumentSnapshot,
  writeBatch,
  Timestamp
} from 'firebase/firestore';
import { firestore } from './config';
import { Therapist, Clinic, ClinicSpaceListing, UserInquiry, User, UserRole, Certification, ActivityLog, MembershipHistoryItem } from '../../types';

// Generic function to get a document by ID
export const getDocumentById = async <T>(collectionName: string, id: string): Promise<T | null> => {
  try {
    const docRef = doc(firestore, collectionName, id);
    const docSnap = await getDoc(docRef);
    
    if (!docSnap.exists()) {
      return null;
    }
    
    return { id: docSnap.id, ...docSnap.data() } as T;
  } catch (error: any) {
    console.error(`Error getting ${collectionName} document:`, error);
    throw new Error(error.message || `Failed to get ${collectionName} document`);
  }
};

// Generic function to update a document
export const updateDocument = async <T>(collectionName: string, id: string, data: Partial<T>): Promise<void> => {
  try {
    const docRef = doc(firestore, collectionName, id);
    await updateDoc(docRef, {
      ...data,
      updatedAt: Timestamp.now()
    });
  } catch (error: any) {
    console.error(`Error updating ${collectionName} document:`, error);
    throw new Error(error.message || `Failed to update ${collectionName} document`);
  }
};

// Generic function to create a document with a specific ID
export const createDocumentWithId = async <T>(collectionName: string, id: string, data: T): Promise<void> => {
  try {
    const docRef = doc(firestore, collectionName, id);
    await setDoc(docRef, {
      ...data,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now()
    });
  } catch (error: any) {
    console.error(`Error creating ${collectionName} document:`, error);
    throw new Error(error.message || `Failed to create ${collectionName} document`);
  }
};

// Generic function to delete a document
export const deleteDocument = async (collectionName: string, id: string): Promise<void> => {
  try {
    const docRef = doc(firestore, collectionName, id);
    await deleteDoc(docRef);
  } catch (error: any) {
    console.error(`Error deleting ${collectionName} document:`, error);
    throw new Error(error.message || `Failed to delete ${collectionName} document`);
  }
};

// Generic paginated query function
export const getPaginatedDocuments = async <T>(
  collectionName: string,
  whereConditions: [string, any, any][] = [],
  orderByField: string = 'createdAt',
  orderDirection: 'asc' | 'desc' = 'desc',
  pageSize: number = 10,
  lastDoc?: QueryDocumentSnapshot<DocumentData>
): Promise<{ items: T[], lastDoc: QueryDocumentSnapshot<DocumentData> | null }> => {
  try {
    let q = collection(firestore, collectionName);
    
    // Build query with where conditions
    let queryConstraints = [];
    for (const [field, operator, value] of whereConditions) {
      queryConstraints.push(where(field, operator, value));
    }
    
    // Add ordering
    queryConstraints.push(orderBy(orderByField, orderDirection));
    
    // Add pagination
    queryConstraints.push(limit(pageSize));
    
    // Add startAfter if we have a last document
    if (lastDoc) {
      queryConstraints.push(startAfter(lastDoc));
    }
    
    const queryRef = query(q, ...queryConstraints);
    const querySnapshot = await getDocs(queryRef);
    
    const items: T[] = [];
    let newLastDoc: QueryDocumentSnapshot<DocumentData> | null = null;
    
    querySnapshot.forEach((doc) => {
      items.push({ id: doc.id, ...doc.data() } as T);
      newLastDoc = doc;
    });
    
    return { items, lastDoc: newLastDoc };
  } catch (error: any) {
    console.error(`Error querying ${collectionName} collection:`, error);
    throw new Error(error.message || `Failed to query ${collectionName} collection`);
  }
};

// User-specific functions
export const getUserById = async (id: string): Promise<User | null> => {
  return getDocumentById<User>('users', id);
};

export const getUserByEmail = async (email: string): Promise<User | null> => {
  try {
    const usersRef = collection(firestore, 'users');
    const q = query(usersRef, where('email', '==', email), limit(1));
    const querySnapshot = await getDocs(q);
    
    if (querySnapshot.empty) {
      return null;
    }
    
    const doc = querySnapshot.docs[0];
    return { id: doc.id, ...doc.data() } as User;
  } catch (error: any) {
    console.error('Error getting user by email:', error);
    throw new Error(error.message || 'Failed to get user by email');
  }
};

export const updateUser = async (id: string, data: Partial<User>): Promise<void> => {
  return updateDocument<User>('users', id, data);
};

// Therapist-specific functions
export const getTherapistById = async (id: string): Promise<Therapist | null> => {
  return getDocumentById<Therapist>('therapists_data', id);
};

export const updateTherapistProfile = async (id: string, data: Partial<Therapist>): Promise<void> => {
  return updateDocument<Therapist>('therapists_data', id, data);
};

export const getAllTherapists = async (status?: string): Promise<Therapist[]> => {
  try {
    const therapistsRef = collection(firestore, 'therapists_data');
    let q;
    
    if (status) {
      q = query(therapistsRef, where('accountStatus', '==', status));
    } else {
      q = query(therapistsRef);
    }
    
    const querySnapshot = await getDocs(q);
    const therapists: Therapist[] = [];
    
    querySnapshot.forEach((doc) => {
      therapists.push({ id: doc.id, ...doc.data() } as Therapist);
    });
    
    return therapists;
  } catch (error: any) {
    console.error('Error getting therapists:', error);
    throw new Error(error.message || 'Failed to get therapists');
  }
};

// Certification functions
export const addCertification = async (certification: Omit<Certification, 'id'>): Promise<string> => {
  try {
    const certId = `cert_${Date.now()}`;
    const certData = {
      ...certification,
      id: certId,
      isVerified: false,
      uploadedAt: new Date().toISOString()
    };
    
    await createDocumentWithId<Certification>('certifications', certId, certData as Certification);
    return certId;
  } catch (error: any) {
    console.error('Error adding certification:', error);
    throw new Error(error.message || 'Failed to add certification');
  }
};

export const updateCertification = async (id: string, data: Partial<Certification>): Promise<void> => {
  return updateDocument<Certification>('certifications', id, data);
};

export const deleteCertification = async (id: string): Promise<void> => {
  return deleteDocument('certifications', id);
};

export const getTherapistCertifications = async (therapistId: string): Promise<Certification[]> => {
  try {
    const certificationsRef = collection(firestore, 'certifications');
    const q = query(certificationsRef, where('therapistUserId', '==', therapistId));
    const querySnapshot = await getDocs(q);
    
    const certifications: Certification[] = [];
    querySnapshot.forEach((doc) => {
      certifications.push({ id: doc.id, ...doc.data() } as Certification);
    });
    
    return certifications;
  } catch (error: any) {
    console.error('Error getting therapist certifications:', error);
    throw new Error(error.message || 'Failed to get therapist certifications');
  }
};

// Clinic-specific functions
export const getClinicById = async (id: string): Promise<Clinic | null> => {
  return getDocumentById<Clinic>('clinics_data', id);
};

export const getClinicByOwnerId = async (ownerId: string): Promise<Clinic | null> => {
  try {
    const clinicsRef = collection(firestore, 'clinics_data');
    const q = query(clinicsRef, where('ownerId', '==', ownerId), limit(1));
    const querySnapshot = await getDocs(q);
    
    if (querySnapshot.empty) {
      return null;
    }
    
    const doc = querySnapshot.docs[0];
    return { id: doc.id, ...doc.data() } as Clinic;
  } catch (error: any) {
    console.error('Error getting clinic by owner ID:', error);
    throw new Error(error.message || 'Failed to get clinic by owner ID');
  }
};

export const updateClinicProfile = async (id: string, data: Partial<Clinic>): Promise<void> => {
  return updateDocument<Clinic>('clinics_data', id, data);
};

export const getAllClinics = async (status?: string): Promise<Clinic[]> => {
  try {
    const clinicsRef = collection(firestore, 'clinics_data');
    let q;
    
    if (status) {
      q = query(clinicsRef, where('accountStatus', '==', status));
    } else {
      q = query(clinicsRef);
    }
    
    const querySnapshot = await getDocs(q);
    const clinics: Clinic[] = [];
    
    querySnapshot.forEach((doc) => {
      clinics.push({ id: doc.id, ...doc.data() } as Clinic);
    });
    
    return clinics;
  } catch (error: any) {
    console.error('Error getting clinics:', error);
    throw new Error(error.message || 'Failed to get clinics');
  }
};

// Clinic Space functions
export const getClinicSpaceById = async (id: string): Promise<ClinicSpaceListing | null> => {
  return getDocumentById<ClinicSpaceListing>('clinic_spaces', id);
};

export const createClinicSpace = async (data: Omit<ClinicSpaceListing, 'id'>): Promise<string> => {
  try {
    const spaceId = `space_${Date.now()}`;
    await createDocumentWithId<ClinicSpaceListing>('clinic_spaces', spaceId, { ...data, id: spaceId } as ClinicSpaceListing);
    return spaceId;
  } catch (error: any) {
    console.error('Error creating clinic space:', error);
    throw new Error(error.message || 'Failed to create clinic space');
  }
};

export const updateClinicSpace = async (id: string, data: Partial<ClinicSpaceListing>): Promise<void> => {
  return updateDocument<ClinicSpaceListing>('clinic_spaces', id, data);
};

export const deleteClinicSpace = async (id: string): Promise<void> => {
  return deleteDocument('clinic_spaces', id);
};

export const getClinicSpacesByClinicId = async (clinicId: string): Promise<ClinicSpaceListing[]> => {
  try {
    const spacesRef = collection(firestore, 'clinic_spaces');
    const q = query(spacesRef, where('clinicId', '==', clinicId));
    const querySnapshot = await getDocs(q);
    
    const spaces: ClinicSpaceListing[] = [];
    querySnapshot.forEach((doc) => {
      spaces.push({ id: doc.id, ...doc.data() } as ClinicSpaceListing);
    });
    
    return spaces;
  } catch (error: any) {
    console.error('Error getting clinic spaces:', error);
    throw new Error(error.message || 'Failed to get clinic spaces');
  }
};

// User Inquiry functions
export const createUserInquiry = async (data: Omit<UserInquiry, 'id' | 'date'>): Promise<string> => {
  try {
    const inquiryId = `inq_${Date.now()}`;
    const inquiryData = {
      ...data,
      id: inquiryId,
      date: new Date().toISOString(),
      status: 'open'
    };
    
    await createDocumentWithId<UserInquiry>('user_inquiries', inquiryId, inquiryData as UserInquiry);
    return inquiryId;
  } catch (error: any) {
    console.error('Error creating user inquiry:', error);
    throw new Error(error.message || 'Failed to create user inquiry');
  }
};

export const getUserInquiriesByUserId = async (
  userId: string,
  pageSize: number = 10,
  lastDoc?: QueryDocumentSnapshot<DocumentData>
): Promise<{ items: UserInquiry[], lastDoc: QueryDocumentSnapshot<DocumentData> | null }> => {
  return getPaginatedDocuments<UserInquiry>(
    'user_inquiries',
    [['userId', '==', userId]],
    'date',
    'desc',
    pageSize,
    lastDoc
  );
};

export const getAllUserInquiries = async (
  status?: string,
  pageSize: number = 10,
  lastDoc?: QueryDocumentSnapshot<DocumentData>
): Promise<{ items: UserInquiry[], lastDoc: QueryDocumentSnapshot<DocumentData> | null }> => {
  const whereConditions: [string, any, any][] = [];
  if (status && status !== 'all') {
    whereConditions.push(['status', '==', status]);
  }
  
  return getPaginatedDocuments<UserInquiry>(
    'user_inquiries',
    whereConditions,
    'date',
    'desc',
    pageSize,
    lastDoc
  );
};

export const updateUserInquiry = async (id: string, data: Partial<UserInquiry>): Promise<void> => {
  return updateDocument<UserInquiry>('user_inquiries', id, data);
};

// Activity Log functions
export const createActivityLog = async (data: Omit<ActivityLog, 'id' | 'timestamp'>): Promise<string> => {
  try {
    const logId = `log_${Date.now()}`;
    const logData = {
      ...data,
      id: logId,
      timestamp: new Date().toISOString()
    };
    
    await createDocumentWithId<ActivityLog>('activity_logs', logId, logData as ActivityLog);
    return logId;
  } catch (error: any) {
    console.error('Error creating activity log:', error);
    throw new Error(error.message || 'Failed to create activity log');
  }
};

export const getActivityLogs = async (
  action?: string,
  userId?: string,
  pageSize: number = 20,
  lastDoc?: QueryDocumentSnapshot<DocumentData>
): Promise<{ items: ActivityLog[], lastDoc: QueryDocumentSnapshot<DocumentData> | null }> => {
  const whereConditions: [string, any, any][] = [];
  
  if (action) {
    whereConditions.push(['action', '==', action]);
  }
  
  if (userId) {
    whereConditions.push(['userId', '==', userId]);
  }
  
  return getPaginatedDocuments<ActivityLog>(
    'activity_logs',
    whereConditions,
    'timestamp',
    'desc',
    pageSize,
    lastDoc
  );
};

// Membership History functions
export const createMembershipHistoryItem = async (data: Omit<MembershipHistoryItem, 'id'>): Promise<string> => {
  try {
    const historyId = `mhist_${data.targetType.toLowerCase()}_${Date.now()}`;
    const historyData = {
      ...data,
      id: historyId
    };
    
    await createDocumentWithId<MembershipHistoryItem>('membership_history', historyId, historyData as MembershipHistoryItem);
    return historyId;
  } catch (error: any) {
    console.error('Error creating membership history item:', error);
    throw new Error(error.message || 'Failed to create membership history item');
  }
};

export const getMembershipHistory = async (targetId: string, targetType: 'THERAPIST' | 'CLINIC'): Promise<MembershipHistoryItem[]> => {
  try {
    const historyRef = collection(firestore, 'membership_history');
    const q = query(
      historyRef, 
      where('targetId', '==', targetId),
      where('targetType', '==', targetType),
      orderBy('date', 'desc')
    );
    
    const querySnapshot = await getDocs(q);
    const history: MembershipHistoryItem[] = [];
    
    querySnapshot.forEach((doc) => {
      history.push({ id: doc.id, ...doc.data() } as MembershipHistoryItem);
    });
    
    return history;
  } catch (error: any) {
    console.error('Error getting membership history:', error);
    throw new Error(error.message || 'Failed to get membership history');
  }
};

// Client Favorites functions
export const toggleFavoriteTherapist = async (clientId: string, therapistId: string): Promise<{ action: 'added' | 'removed', favorites: string[] }> => {
  try {
    const favoriteId = `${clientId}_${therapistId}`;
    const favoriteRef = doc(firestore, 'client_therapist_favorites', favoriteId);
    const favoriteDoc = await getDoc(favoriteRef);
    
    if (favoriteDoc.exists()) {
      // Remove favorite
      await deleteDoc(favoriteRef);
      
      // Get updated favorites
      const favoritesRef = collection(firestore, 'client_therapist_favorites');
      const q = query(favoritesRef, where('clientId', '==', clientId));
      const querySnapshot = await getDocs(q);
      
      const favorites: string[] = [];
      querySnapshot.forEach((doc) => {
        favorites.push(doc.data().therapistId);
      });
      
      return { action: 'removed', favorites };
    } else {
      // Add favorite
      await setDoc(favoriteRef, {
        clientId,
        therapistId,
        createdAt: Timestamp.now()
      });
      
      // Get updated favorites
      const favoritesRef = collection(firestore, 'client_therapist_favorites');
      const q = query(favoritesRef, where('clientId', '==', clientId));
      const querySnapshot = await getDocs(q);
      
      const favorites: string[] = [];
      querySnapshot.forEach((doc) => {
        favorites.push(doc.data().therapistId);
      });
      
      return { action: 'added', favorites };
    }
  } catch (error: any) {
    console.error('Error toggling favorite therapist:', error);
    throw new Error(error.message || 'Failed to toggle favorite therapist');
  }
};

export const getClientFavorites = async (clientId: string): Promise<string[]> => {
  try {
    const favoritesRef = collection(firestore, 'client_therapist_favorites');
    const q = query(favoritesRef, where('clientId', '==', clientId));
    const querySnapshot = await getDocs(q);
    
    const favorites: string[] = [];
    querySnapshot.forEach((doc) => {
      favorites.push(doc.data().therapistId);
    });
    
    return favorites;
  } catch (error: any) {
    console.error('Error getting client favorites:', error);
    throw new Error(error.message || 'Failed to get client favorites');
  }
};

// Migration utilities
export const migrateDataFromMySQLToFirestore = async (
  mysqlData: any[],
  collectionName: string,
  transformFunction: (item: any) => any
): Promise<void> => {
  try {
    const batch = writeBatch(firestore);
    let batchCount = 0;
    const BATCH_LIMIT = 500; // Firestore batch limit is 500
    
    for (const item of mysqlData) {
      const transformedData = transformFunction(item);
      const docRef = doc(firestore, collectionName, transformedData.id);
      batch.set(docRef, transformedData);
      
      batchCount++;
      
      // If we reach the batch limit, commit and start a new batch
      if (batchCount >= BATCH_LIMIT) {
        await batch.commit();
        batchCount = 0;
      }
    }
    
    // Commit any remaining items
    if (batchCount > 0) {
      await batch.commit();
    }
    
    console.log(`Successfully migrated ${mysqlData.length} items to ${collectionName}`);
  } catch (error: any) {
    console.error(`Error migrating data to ${collectionName}:`, error);
    throw new Error(error.message || `Failed to migrate data to ${collectionName}`);
  }
};