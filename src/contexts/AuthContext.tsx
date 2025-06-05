import React, { createContext, useState, useContext, ReactNode, useCallback, useEffect } from 'react';
import { User, UserRole } from '../types';
import { DEFAULT_USER_ROLE } from '../constants';
import { useFirebase } from './FirebaseContext';
import { signIn, signUp, signOutUser, resetPassword, changePassword } from '../firebase/auth';

interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (name: string, email: string, password: string, role?: UserRole) => Promise<void>;
  logout: () => void;
  updateUserAuthContext: (updatedUserData: Partial<User>) => void;
  authLoading: boolean;
  authError: string | null;
  promptLogin: (actionAttempted?: string) => void;
  isLoginPromptVisible: boolean;
  closeLoginPrompt: () => void;
  actionAttempted: string | null;
  resetUserPassword: (email: string) => Promise<void>;
  changeUserPassword: (currentPassword: string, newPassword: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { firebaseUser, appUser, loading: firebaseLoading } = useFirebase();
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isLoginPromptVisible, setIsLoginPromptVisible] = useState(false);
  const [actionAttempted, setActionAttempted] = useState<string | null>(null);

  // Update auth context when Firebase user changes
  useEffect(() => {
    setAuthLoading(firebaseLoading);
    
    if (appUser && firebaseUser) {
      setUser(appUser);
      firebaseUser.getIdToken().then(idToken => {
        setToken(idToken);
      });
    } else {
      setUser(null);
      setToken(null);
    }
  }, [firebaseUser, appUser, firebaseLoading]);

  const isAuthenticated = !!user && !!token;

  const updateUserAuthContext = useCallback((updatedUserData: Partial<User>) => {
    setUser(prevUser => {
      if (!prevUser) return null;
      return { ...prevUser, ...updatedUserData };
    });
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    setAuthLoading(true);
    setAuthError(null);

    try {
      const userData = await signIn(email, password);
      setUser(userData);
      
      if (firebaseUser) {
        const idToken = await firebaseUser.getIdToken();
        setToken(idToken);
      }
      
      setIsLoginPromptVisible(false);
      setActionAttempted(null);
    } catch (error: any) {
      console.error("Login error:", error);
      setAuthError(error.message || "An error occurred during login. Please try again.");
      setUser(null);
      setToken(null);
    } finally {
      setAuthLoading(false);
    }
  }, [firebaseUser]);

  const signup = useCallback(async (name: string, email: string, password: string, role: UserRole = DEFAULT_USER_ROLE) => {
    setAuthLoading(true);
    setAuthError(null);
    
    try {
      const userData = await signUp(name, email, password, role);
      setUser(userData);
      
      if (firebaseUser) {
        const idToken = await firebaseUser.getIdToken();
        setToken(idToken);
      }
      
      setIsLoginPromptVisible(false);
      setActionAttempted(null);
    } catch (error: any) {
      console.error("Signup error:", error);
      setAuthError(error.message || "An error occurred during signup. Please try again.");
    } finally {
      setAuthLoading(false);
    }
  }, [firebaseUser]);

  const logout = useCallback(() => {
    signOutUser().then(() => {
      setUser(null);
      setToken(null);
      setIsLoginPromptVisible(false);
      setActionAttempted(null);
      setAuthError(null);
    }).catch(error => {
      console.error("Logout error:", error);
    });
  }, []);

  const promptLogin = useCallback((action?: string) => {
    setActionAttempted(action || null);
    setIsLoginPromptVisible(true);
  }, []);

  const closeLoginPrompt = useCallback(() => {
    setIsLoginPromptVisible(false);
    setActionAttempted(null);
  }, []);
  
  const resetUserPassword = useCallback(async (email: string) => {
    setAuthLoading(true);
    setAuthError(null);
    
    try {
      await resetPassword(email);
    } catch (error: any) {
      console.error("Password reset error:", error);
      setAuthError(error.message || "An error occurred during password reset. Please try again.");
      throw error;
    } finally {
      setAuthLoading(false);
    }
  }, []);
  
  const changeUserPassword = useCallback(async (currentPassword: string, newPassword: string) => {
    setAuthLoading(true);
    setAuthError(null);
    
    try {
      await changePassword(currentPassword, newPassword);
    } catch (error: any) {
      console.error("Password change error:", error);
      setAuthError(error.message || "An error occurred while changing password. Please try again.");
      throw error;
    } finally {
      setAuthLoading(false);
    }
  }, []);

  return (
    <AuthContext.Provider value={{
      user,
      token,
      isAuthenticated,
      login,
      signup,
      logout,
      updateUserAuthContext,
      authLoading,
      authError,
      promptLogin,
      isLoginPromptVisible,
      closeLoginPrompt,
      actionAttempted,
      resetUserPassword,
      changeUserPassword
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};