import React, { createContext, useContext, useEffect, useState } from 'react';
import { User as FirebaseUser } from 'firebase/auth';
import { auth } from '../src/firebase/config';
import { getCurrentUser } from '../src/firebase/auth';
import { User } from '../types';

interface FirebaseContextType {
  firebaseUser: FirebaseUser | null;
  appUser: User | null;
  loading: boolean;
  error: string | null;
}

const FirebaseContext = createContext<FirebaseContextType>({
  firebaseUser: null,
  appUser: null,
  loading: true,
  error: null
});

export const FirebaseProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [appUser, setAppUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      setLoading(true);
      setError(null);
      
      try {
        if (user) {
          setFirebaseUser(user);
          
          // Get additional user data from Firestore
          const userData = await getCurrentUser(user);
          setAppUser(userData);
        } else {
          setFirebaseUser(null);
          setAppUser(null);
        }
      } catch (err: any) {
        console.error('Error in auth state change:', err);
        setError(err.message || 'An error occurred during authentication');
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  return (
    <FirebaseContext.Provider value={{ firebaseUser, appUser, loading, error }}>
      {children}
    </FirebaseContext.Provider>
  );
};

export const useFirebase = () => useContext(FirebaseContext);