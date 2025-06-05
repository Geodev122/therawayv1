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
  QueryDocumentSnapshot
} from 'firebase/firestore';
import { firestore } from './config';
import { Therapist, Clinic, ClinicSpaceListing, UserInquiry } from '../types';

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
      updatedAt: new Date().toISOString()
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
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
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

// Therapist-specific functions
export const getTherapistById = async (id: string): Promise<Therapist | null> => {
  return getDocumentById<Therapist>('therapists_data', id);
};

export const updateTherapistProfile = async (id: string, data: Partial<Therapist>): Promise<void> => {
  return updateDocument<Therapist>('therapists_data', id, data);
};

// Clinic-specific functions
export const getClinicById = async (id: string): Promise<Clinic | null> => {
  return getDocumentById<Clinic>('clinics_data', id);
};

export const updateClinicProfile = async (id: string, data: Partial<Clinic>): Promise<void> => {
  return updateDocument<Clinic>('clinics_data', id, data);
};

// Clinic Space functions
export const getClinicSpaceById = async (id: string): Promise<ClinicSpaceListing | null> => {
  return getDocumentById<ClinicSpaceListing>('clinic_spaces', id);
};

export const createClinicSpace = async (data: ClinicSpaceListing): Promise<void> => {
  return createDocumentWithId<ClinicSpaceListing>('clinic_spaces', data.id, data);
};

export const updateClinicSpace = async (id: string, data: Partial<ClinicSpaceListing>): Promise<void> => {
  return updateDocument<ClinicSpaceListing>('clinic_spaces', id, data);
};

export const deleteClinicSpace = async (id: string): Promise<void> => {
  return deleteDocument('clinic_spaces', id);
};

// User Inquiry functions
export const createUserInquiry = async (data: UserInquiry): Promise<void> => {
  return createDocumentWithId<UserInquiry>('user_inquiries', data.id, data);
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