import React, { createContext, useState, useContext, ReactNode, useCallback, useEffect } from 'react';
import { User, UserRole } from '../types';
import { DEFAULT_USER_ROLE, API_BASE_URL } from '../constants';

interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  login: (email: string, password?: string) => Promise<void>;
  signup: (name: string, email: string, password?: string, role?: UserRole) => Promise<void>;
  logout: () => void;
  updateUserAuthContext: (updatedUserData: Partial<User>) => void;
  authLoading: boolean;
  authError: string | null;
  promptLogin: (actionAttempted?: string) => void;
  isLoginPromptVisible: boolean;
  closeLoginPrompt: () => void;
  actionAttempted: string | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isLoginPromptVisible, setIsLoginPromptVisible] = useState(false);
  const [actionAttempted, setActionAttempted] = useState<string | null>(null);

  useEffect(() => {
    setAuthLoading(true);
    try {
      const storedUser = localStorage.getItem('theraWayUser');
      const storedToken = localStorage.getItem('theraWayToken');
      if (storedUser && storedToken) {
        const parsedUser: User = JSON.parse(storedUser);
        setUser(parsedUser);
        setToken(storedToken);
      }
    } catch (error) {
      console.error("Failed to parse stored user/token:", error);
      localStorage.removeItem('theraWayUser');
      localStorage.removeItem('theraWayToken');
    }
    setAuthLoading(false);
  }, []);

  const isAuthenticated = !!user && !!token;

  const updateUserAuthContext = useCallback((updatedUserData: Partial<User>) => {
    setUser(prevUser => {
        if (!prevUser) return null;
        const newUser = { ...prevUser, ...updatedUserData };
        localStorage.setItem('theraWayUser', JSON.stringify(newUser));
        return newUser;
    });
  }, []);


  const login = useCallback(async (email: string, password?: string) => {
    setAuthLoading(true);
    setAuthError(null);

    // --- CRITICAL SECURITY WARNING ---
    // The following 'if' block provides a backdoor login for development purposes.
    // This MUST BE REMOVED or properly secured (e.g., via environment variables
    // checked ONLY in a development build) before deploying to a live/production environment.
    // Exposing this in production is a SEVERE security risk.
    if (email === 'geo.elnajjar@gmail.com' && password === '123456') {
      const adminUser: User = {
        id: 'admin-geo-001',
        email: 'geo.elnajjar@gmail.com',
        role: UserRole.ADMIN,
        name: 'Geo Admin',
        profilePictureUrl: null, // Or a placeholder image URL
      };
      const adminToken = 'mock-admin-jwt-token-for-geo';
      localStorage.setItem('theraWayUser', JSON.stringify(adminUser));
      localStorage.setItem('theraWayToken', adminToken);
      setUser(adminUser);
      setToken(adminToken);
      setIsLoginPromptVisible(false);
      setActionAttempted(null);
      setAuthLoading(false);
      console.warn("CRITICAL WARNING: Logged in as Dev Admin (geo.elnajjar@gmail.com) via development backdoor. REMOVE FOR PRODUCTION.");
      return;
    }
    // --- END OF CRITICAL SECURITY WARNING ---
    
    if (!password) {
        setAuthError("Password is required for login.");
        setAuthLoading(false);
        return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/auth.php`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'login', email, password }),
      });
      
      // Check if response is OK before trying to parse JSON
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Server error: ${response.status} - ${errorText}`);
      }
      
      const data = await response.json();

      if (data.status === 'success' && data.token && data.user) {
        localStorage.setItem('theraWayUser', JSON.stringify(data.user));
        localStorage.setItem('theraWayToken', data.token);
        setUser(data.user);
        setToken(data.token);
        setIsLoginPromptVisible(false);
        setActionAttempted(null);
      } else {
        setAuthError(data.message || "Login failed. Please check your credentials.");
        localStorage.removeItem('theraWayUser');
        localStorage.removeItem('theraWayToken');
        setUser(null);
        setToken(null);
      }
    } catch (error: any) {
      console.error("Login API error:", error);
      setAuthError("An error occurred during login. Please try again.");
      localStorage.removeItem('theraWayUser');
      localStorage.removeItem('theraWayToken');
      setUser(null);
      setToken(null);
    }
    setAuthLoading(false);
  }, []);

  const signup = useCallback(async (name: string, email: string, password?: string, role: UserRole = DEFAULT_USER_ROLE) => {
    setAuthLoading(true);
    setAuthError(null);
    
    if (!password) {
        setAuthError("Password is required for signup.");
        setAuthLoading(false);
        return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/auth.php`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'signup', name, email, password, role }),
      });
      
      // Check if response is OK before trying to parse JSON
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Server error: ${response.status} - ${errorText}`);
      }
      
      const data = await response.json();

      if (data.status === 'success' && data.token && data.user) {
        localStorage.setItem('theraWayUser', JSON.stringify(data.user));
        localStorage.setItem('theraWayToken', data.token);
        setUser(data.user);
        setToken(data.token);
        setIsLoginPromptVisible(false);
        setActionAttempted(null);
      } else {
        setAuthError(data.message || "Signup failed. Please try again.");
      }
    } catch (error: any) {
      console.error("Signup API error:", error);
      setAuthError("An error occurred during signup. Please try again.");
    }
    setAuthLoading(false);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('theraWayUser');
    localStorage.removeItem('theraWayToken');
    setUser(null);
    setToken(null);
    setIsLoginPromptVisible(false);
    setActionAttempted(null);
    setAuthError(null);
    // TODO: Optionally, call a backend endpoint to invalidate the token
  }, []);

  const promptLogin = useCallback((action?: string) => {
    setActionAttempted(action || null);
    setIsLoginPromptVisible(true);
  }, []);

  const closeLoginPrompt = useCallback(() => {
    setIsLoginPromptVisible(false);
    setActionAttempted(null);
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
        actionAttempted
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