import React, { Suspense } from 'react';
import { HashRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { LanguageProvider } from './contexts/LanguageContext';
import { useTranslation } from './hooks/useTranslation';
import { Navbar } from './components/Navbar';
import { LoginPromptModal } from './components/auth/LoginPromptModal';
import { UserRole } from './types';

// Eagerly import page components using relative paths
import { LoginPage } from './pages/LoginPage';
import { TherapistFinderPage } from './pages/TherapistFinderPage';
import { TherapistDashboardRoutes } from './pages/dashboard/TherapistDashboardPage';
import { ClinicOwnerDashboardRoutes } from './pages/dashboard/ClinicOwnerDashboardPage';
import { AdminDashboardRoutes } from './pages/dashboard/AdminDashboardPage';
import { ClientProfilePage } from './pages/dashboard/client/ClientProfilePage';


const ProtectedRoute: React.FC<{ children: React.ReactNode; allowedRoles: UserRole[] }> = ({ children, allowedRoles }) => {
  const { isAuthenticated, user, authLoading } = useAuth(); 
  const location = useLocation();
  const { t } = useTranslation();

  if (authLoading) { 
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-accent" title={t('loading')}/>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (user && !allowedRoles.includes(user.role)) {
    let defaultDashboard = '/'; 
    if (user.role === UserRole.THERAPIST) defaultDashboard = '/dashboard/therapist';
    if (user.role === UserRole.CLINIC_OWNER) defaultDashboard = '/dashboard/clinic';
    if (user.role === UserRole.ADMIN) defaultDashboard = '/dashboard/admin';
    if (user.role === UserRole.CLIENT) defaultDashboard = '/dashboard/client/profile';
    
    return <Navigate to={defaultDashboard} replace />; 
  }

  return <>{children}</>;
};


const AppContent: React.FC = () => {
  const { isAuthenticated, authLoading, isLoginPromptVisible, closeLoginPrompt, actionAttempted, user } = useAuth(); 
  const { t } = useTranslation();

  if (authLoading && !user) {  
     return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-accent" title={t('loading')}/>
      </div>
    );
  }
  
  const LoadingFallback: React.FC = () => (
    <div className="flex items-center justify-center flex-grow">
      <div className="animate-spin rounded-full h-12 w-12 border-t-4 border-b-4 border-accent" title={t('loading')}/>
    </div>
  );

  return (
    <div className="flex flex-col min-h-screen bg-background"> 
      <Navbar />
      <main className="flex-grow flex flex-col pt-[calc(4rem+1px)]"> 
        <Suspense fallback={<LoadingFallback />}>
          <Routes>
            {/* Public Routes */}
            <Route path="/login" element={<LoginPage />} />
            <Route path="/" element={<TherapistFinderPage />} /> 
            <Route path="/therapists" element={<Navigate to="/" replace />} />

            {/* Protected Dashboard Routes */}
            <Route 
              path="/dashboard/client/profile"
              element={
                <ProtectedRoute allowedRoles={[UserRole.CLIENT, UserRole.ADMIN]}>
                  <ClientProfilePage />
                </ProtectedRoute>
              }
            />
            <Route 
              path="/dashboard/therapist/*" 
              element={
                <ProtectedRoute allowedRoles={[UserRole.THERAPIST, UserRole.ADMIN]}>
                  <TherapistDashboardRoutes />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/dashboard/clinic/*" 
              element={
                <ProtectedRoute allowedRoles={[UserRole.CLINIC_OWNER, UserRole.ADMIN]}>
                  <ClinicOwnerDashboardRoutes />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/dashboard/admin/*" 
              element={
                <ProtectedRoute allowedRoles={[UserRole.ADMIN]}>
                  <AdminDashboardRoutes />
                </ProtectedRoute>
              } 
            />
            
            <Route 
              path="*" 
              element={
                authLoading ? <LoadingFallback /> : 
                isAuthenticated ? (
                  user?.role === UserRole.THERAPIST ? <Navigate to="/dashboard/therapist" replace /> :
                  user?.role === UserRole.CLINIC_OWNER ? <Navigate to="/dashboard/clinic" replace /> :
                  user?.role === UserRole.ADMIN ? <Navigate to="/dashboard/admin" replace /> :
                  user?.role === UserRole.CLIENT ? <Navigate to="/dashboard/client/profile" replace /> :
                  <Navigate to="/" replace /> 
                ) : <Navigate to="/login" replace />
              } 
            />
          </Routes>
        </Suspense>
      </main>
      <LoginPromptModal 
        isOpen={isLoginPromptVisible} 
        onClose={closeLoginPrompt}
        actionAttempted={actionAttempted}
      />
    </div>
  );
};

const App: React.FC = () => {
  return (
    <AuthProvider>
      <LanguageProvider> 
        <HashRouter>
          <AppContent />
        </HashRouter>
      </LanguageProvider>
    </AuthProvider>
  );
};

export default App;