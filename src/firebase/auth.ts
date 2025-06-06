import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signOut, 
  updateProfile,
  User as FirebaseUser,
  UserCredential,
  sendPasswordResetEmail,
  updatePassword,
  EmailAuthProvider,
  reauthenticateWithCredential,
  GoogleAuthProvider,
  FacebookAuthProvider,
  signInWithPopup,
  getAdditionalUserInfo
} from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { auth, firestore } from './config';
import { User, UserRole } from '../types';

// Sign up a new user with email/password
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
        user_id: firebaseUser.uid,
        account_status: 'draft',
        bio: '',
        specializations: [],
        languages: [],
        qualifications: [],
        locations: [],
        rating: 0,
        review_count: 0,
        profile_views: 0,
        likes_count: 0,
        whatsapp_number: '',
        is_overall_verified: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
    } else if (role === UserRole.CLINIC_OWNER) {
      const clinicId = `clinic_${firebaseUser.uid}`;
      await setDoc(doc(firestore, 'clinics_data', clinicId), {
        user_id: firebaseUser.uid,
        clinic_id: clinicId,
        clinic_name: `${name}'s Clinic`,
        account_status: 'draft',
        description: '',
        address: '',
        whatsapp_number: '',
        amenities: [],
        operating_hours: {},
        services: [],
        clinic_photos: [],
        is_verified_by_admin: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
    }
    
    return userDoc;
  } catch (error: any) {
    console.error('Error signing up:', error);
    throw new Error(error.message || 'Failed to sign up');
  }
};

// Sign in with email/password
export const signIn = async (email: string, password: string): Promise<User> => {
  try {
    const userCredential: UserCredential = await signInWithEmailAndPassword(auth, email, password);
    const firebaseUser = userCredential.user;
    
    // Get user data from Firestore
    return await getCurrentUser(firebaseUser);
  } catch (error: any) {
    console.error('Error signing in:', error);
    throw new Error(error.message || 'Failed to sign in');
  }
};

// Sign in with Google
export const signInWithGoogle = async (defaultRole: UserRole = UserRole.CLIENT): Promise<User> => {
  try {
    const provider = new GoogleAuthProvider();
    const userCredential = await signInWithPopup(auth, provider);
    const firebaseUser = userCredential.user;
    const isNewUser = getAdditionalUserInfo(userCredential)?.isNewUser;
    
    // Check if user exists in Firestore
    const userDoc = await getDoc(doc(firestore, 'users', firebaseUser.uid));
    
    if (!userDoc.exists() || isNewUser) {
      // Create new user document
      const newUser: User = {
        id: firebaseUser.uid,
        name: firebaseUser.displayName || 'User',
        email: firebaseUser.email || '',
        role: defaultRole,
        profilePictureUrl: firebaseUser.photoURL || null
      };
      
      await setDoc(doc(firestore, 'users', firebaseUser.uid), {
        ...newUser,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      
      // Create role-specific data
      if (defaultRole === UserRole.THERAPIST) {
        await setDoc(doc(firestore, 'therapists_data', firebaseUser.uid), {
          user_id: firebaseUser.uid,
          account_status: 'draft',
          bio: '',
          specializations: [],
          languages: [],
          qualifications: [],
          locations: [],
          rating: 0,
          review_count: 0,
          profile_views: 0,
          likes_count: 0,
          whatsapp_number: '',
          is_overall_verified: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
      } else if (defaultRole === UserRole.CLINIC_OWNER) {
        const clinicId = `clinic_${firebaseUser.uid}`;
        await setDoc(doc(firestore, 'clinics_data', clinicId), {
          user_id: firebaseUser.uid,
          clinic_id: clinicId,
          clinic_name: `${firebaseUser.displayName || 'New'}'s Clinic`,
          account_status: 'draft',
          description: '',
          address: '',
          whatsapp_number: '',
          amenities: [],
          operating_hours: {},
          services: [],
          clinic_photos: [],
          is_verified_by_admin: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
      }
      
      return newUser;
    }
    
    // Return existing user data
    return await getCurrentUser(firebaseUser);
  } catch (error: any) {
    console.error('Error signing in with Google:', error);
    throw new Error(error.message || 'Failed to sign in with Google');
  }
};

// Sign in with Facebook
export const signInWithFacebook = async (defaultRole: UserRole = UserRole.CLIENT): Promise<User> => {
  try {
    const provider = new FacebookAuthProvider();
    const userCredential = await signInWithPopup(auth, provider);
    const firebaseUser = userCredential.user;
    const isNewUser = getAdditionalUserInfo(userCredential)?.isNewUser;
    
    // Check if user exists in Firestore
    const userDoc = await getDoc(doc(firestore, 'users', firebaseUser.uid));
    
    if (!userDoc.exists() || isNewUser) {
      // Create new user document
      const newUser: User = {
        id: firebaseUser.uid,
        name: firebaseUser.displayName || 'User',
        email: firebaseUser.email || '',
        role: defaultRole,
        profilePictureUrl: firebaseUser.photoURL || null
      };
      
      await setDoc(doc(firestore, 'users', firebaseUser.uid), {
        ...newUser,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      
      // Create role-specific data
      if (defaultRole === UserRole.THERAPIST) {
        await setDoc(doc(firestore, 'therapists_data', firebaseUser.uid), {
          user_id: firebaseUser.uid,
          account_status: 'draft',
          bio: '',
          specializations: [],
          languages: [],
          qualifications: [],
          locations: [],
          rating: 0,
          review_count: 0,
          profile_views: 0,
          likes_count: 0,
          whatsapp_number: '',
          is_overall_verified: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
      } else if (defaultRole === UserRole.CLINIC_OWNER) {
        const clinicId = `clinic_${firebaseUser.uid}`;
        await setDoc(doc(firestore, 'clinics_data', clinicId), {
          user_id: firebaseUser.uid,
          clinic_id: clinicId,
          clinic_name: `${firebaseUser.displayName || 'New'}'s Clinic`,
          account_status: 'draft',
          description: '',
          address: '',
          whatsapp_number: '',
          amenities: [],
          operating_hours: {},
          services: [],
          clinic_photos: [],
          is_verified_by_admin: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
      }
      
      return newUser;
    }
    
    // Return existing user data
    return await getCurrentUser(firebaseUser);
  } catch (error: any) {
    console.error('Error signing in with Facebook:', error);
    throw new Error(error.message || 'Failed to sign in with Facebook');
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
export const getCurrentUser = async (firebaseUser: FirebaseUser): Promise<User> => {
  try {
    const userDoc = await getDoc(doc(firestore, 'users', firebaseUser.uid));
    
    if (!userDoc.exists()) {
      // If user document doesn't exist in Firestore, create a basic one
      const newUser: User = {
        id: firebaseUser.uid,
        name: firebaseUser.displayName || 'User',
        email: firebaseUser.email || '',
        role: UserRole.CLIENT, // Default role
        profilePictureUrl: firebaseUser.photoURL || null
      };
      
      await setDoc(doc(firestore, 'users', firebaseUser.uid), {
        ...newUser,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      
      return newUser;
    }
    
    return userDoc.data() as User;
  } catch (error: any) {
    console.error('Error getting current user:', error);
    throw new Error(error.message || 'Failed to get user data');
  }
};

// Send password reset email
export const resetPassword = async (email: string): Promise<void> => {
  try {
    await sendPasswordResetEmail(auth, email);
  } catch (error: any) {
    console.error('Error sending password reset email:', error);
    throw new Error(error.message || 'Failed to send password reset email');
  }
};

// Change password (requires reauthentication)
export const changePassword = async (currentPassword: string, newPassword: string): Promise<void> => {
  try {
    const user = auth.currentUser;
    
    if (!user || !user.email) {
      throw new Error('No authenticated user found');
    }
    
    // Reauthenticate user
    const credential = EmailAuthProvider.credential(user.email, currentPassword);
    await reauthenticateWithCredential(user, credential);
    
    // Change password
    await updatePassword(user, newPassword);
  } catch (error: any) {
    console.error('Error changing password:', error);
    throw new Error(error.message || 'Failed to change password');
  }
};