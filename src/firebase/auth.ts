import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signOut, 
  updateProfile,
  User as FirebaseUser,
  UserCredential
} from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { auth, firestore } from './config';
import { User, UserRole } from '../types';

// Sign up a new user
export const signUp = async (
  name: string, 
  email: string, 
  password: string, 
  role: UserRole = UserRole.CLIENT
): Promise<User> => {
  try {
    // Create user in Firebase Auth
    const userCredential: UserCredential = await createUserWithEmailAndPassword(auth, email, password);
    const firebaseUser = userCredential.user;
    
    // Update profile with name
    await updateProfile(firebaseUser, { displayName: name });
    
    // Create user document in Firestore
    const userDoc = {
      id: firebaseUser.uid,
      name,
      email,
      role,
      profilePictureUrl: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    await setDoc(doc(firestore, 'users', firebaseUser.uid), userDoc);
    
    // Create role-specific data
    if (role === UserRole.THERAPIST) {
      await setDoc(doc(firestore, 'therapists_data', firebaseUser.uid), {
        userId: firebaseUser.uid,
        accountStatus: 'draft',
        bio: '',
        specializations: [],
        languages: [],
        qualifications: [],
        locations: [],
        rating: 0,
        reviewCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    } else if (role === UserRole.CLINIC_OWNER) {
      const clinicId = `clinic_${firebaseUser.uid}`;
      await setDoc(doc(firestore, 'clinics_data', clinicId), {
        clinicId,
        ownerId: firebaseUser.uid,
        name: `${name}'s Clinic`,
        accountStatus: 'draft',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    }
    
    return userDoc;
  } catch (error: any) {
    console.error('Error signing up:', error);
    throw new Error(error.message || 'Failed to sign up');
  }
};

// Sign in an existing user
export const signIn = async (email: string, password: string): Promise<User> => {
  try {
    const userCredential: UserCredential = await signInWithEmailAndPassword(auth, email, password);
    const firebaseUser = userCredential.user;
    
    // Get user data from Firestore
    const userDoc = await getDoc(doc(firestore, 'users', firebaseUser.uid));
    
    if (!userDoc.exists()) {
      throw new Error('User data not found');
    }
    
    return userDoc.data() as User;
  } catch (error: any) {
    console.error('Error signing in:', error);
    throw new Error(error.message || 'Failed to sign in');
  }
};

// Sign out the current user
export const signOutUser = async (): Promise<void> => {
  try {
    await signOut(auth);
  } catch (error: any) {
    console.error('Error signing out:', error);
    throw new Error(error.message || 'Failed to sign out');
  }
};

// Get current user data from Firestore
export const getCurrentUser = async (firebaseUser: FirebaseUser): Promise<User | null> => {
  try {
    const userDoc = await getDoc(doc(firestore, 'users', firebaseUser.uid));
    
    if (!userDoc.exists()) {
      return null;
    }
    
    return userDoc.data() as User;
  } catch (error: any) {
    console.error('Error getting current user:', error);
    return null;
  }
};