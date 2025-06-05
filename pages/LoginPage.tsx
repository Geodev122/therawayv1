import React, { useState, FormEvent, useEffect } from 'react';
import { useNavigate, Navigate, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from '../hooks/useTranslation';
import { usePageTitle } from '../hooks/usePageTitle';
import { DEFAULT_USER_ROLE } from '../constants';
import { Button } from '../components/common/Button';
import { UserRole } from '../types';

export const LoginPage: React.FC = () => {
  const { t } = useTranslation();
  const [pageTitleKey, setPageTitleKey] = useState('loginPageTitle'); 

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<UserRole>(DEFAULT_USER_ROLE);
  const [isSignup, setIsSignup] = useState(false);
  
  const { login, signup, isAuthenticated, authLoading, authError, user, actionAttempted, closeLoginPrompt } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if ((location.state as any)?.isSigningUp) {
      setIsSignup(true);
      setPageTitleKey('signUpPageTitle');
    } else {
      setIsSignup(false);
      setPageTitleKey('loginPageTitle');
    }
  }, [location.state]);

  usePageTitle(pageTitleKey);

  if (isAuthenticated && user) {
    closeLoginPrompt(); 
    let redirectTo = '/'; 
    if (user.role === UserRole.THERAPIST) redirectTo = '/dashboard/therapist';
    else if (user.role === UserRole.CLINIC_OWNER) redirectTo = '/dashboard/clinic';
    else if (user.role === UserRole.ADMIN) redirectTo = '/dashboard/admin';
    
    const from = (location.state as any)?.from?.pathname || redirectTo;
    return <Navigate to={from} replace />;
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    
    if (isSignup) {
      if (!name || !email || !password || !role) {
        alert(t('fillAllFieldsError', { default: 'Please fill in all required fields for signup.'}));
        return;
      }
      await signup(name, email, password, role);
    } else {
      if (!email || !password) {
        alert(t('fillAllFieldsError', { default: 'Please enter both email and password.'}));
        return;
      }
      await login(email, password);
    }
  };

  useEffect(() => {
    setName('');
    setEmail('');
    setPassword('');
  }, [isSignup]);

  return (
    <div className="min-h-screen flex items-start justify-center bg-background px-5 pt-0 pb-5">
      <div className="bg-primary text-textOnLight p-8 sm:p-10 rounded-xl shadow-2xl w-full max-w-md mt-8 sm:mt-12">
        <div className="text-center mb-8">
          <Link to="/" className="text-4xl font-bold text-accent hover:text-accent/90 transition-colors">
            {t('appName')}
          </Link>
          {actionAttempted && !isSignup && (
            <p className="text-gray-600 mt-2 text-sm">
                {t('loginTo', { action: actionAttempted })}
            </p>
          )}
        </div>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          {isSignup && (
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                {t('fullName')} <span className="text-red-500">*</span>
              </label>
              <input
                id="name" name="name" type="text" required={isSignup} value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 block w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-accent/80 focus:border-accent/80 sm:text-sm transition-colors text-textOnLight bg-primary"
                placeholder={t('yourNamePlaceholder', { default: "Your Name"})}
              />
            </div>
          )}
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
              {t('emailAddress')} <span className="text-red-500">*</span>
            </label>
            <input
              id="email" name="email" type="email" autoComplete="email" required
              value={email} onChange={(e) => setEmail(e.target.value)}
              className="mt-1 block w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-accent/80 focus:border-accent/80 sm:text-sm transition-colors text-textOnLight bg-primary"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
              {t('password')} <span className="text-red-500">*</span>
            </label>
            <input
              id="password" name="password" type="password"
              autoComplete={isSignup ? "new-password" : "current-password"}
              required value={password} onChange={(e) => setPassword(e.target.value)}
              className="mt-1 block w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-accent/80 focus:border-accent/80 sm:text-sm transition-colors text-textOnLight bg-primary"
              placeholder="••••••••"
            />
          </div>

          {isSignup && (
            <div>
              <label htmlFor="role" className="block text-sm font-medium text-gray-700 mb-1">
                {t('iAmA')} <span className="text-red-500">*</span>
              </label>
              <select 
                id="role" name="role" value={role} 
                onChange={(e) => setRole(e.target.value as UserRole)}
                className="mt-1 block w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-accent/80 focus:border-accent/80 sm:text-sm transition-colors bg-primary text-textOnLight"
              >
                <option value={UserRole.CLIENT}>{t('clientLookingForTherapist')}</option>
                <option value={UserRole.THERAPIST}>{t('therapist')}</option>
                <option value={UserRole.CLINIC_OWNER}>{t('clinicOwner')}</option>
              </select>
            </div>
          )}

          {authError && <p className="text-sm text-red-600 bg-red-100 p-3 rounded-md text-center">{authError}</p>}

          {!isSignup && (
            <div className="flex items-center justify-between">
              <div></div> {/* Empty div for spacing if remember me is not used */}
              <div className="text-sm">
                <Link to="/forgot-password" className="font-medium text-accent hover:text-accent/80">{t('forgotPassword')}</Link>
              </div>
            </div>
          )}

          <div>
            <Button type="submit" variant="primary" className="w-full !py-3 text-base" isFullWidth disabled={authLoading}>
              {authLoading ? t('loading') : (isSignup ? t('signUp') : t('signIn'))}
            </Button>
          </div>
        </form>

        <p className="mt-8 text-center text-sm text-gray-600">
          {isSignup ? t('alreadyHaveAccount') : t('dontHaveAccount')}{' '}
          <button 
            onClick={() => {
              setIsSignup(!isSignup); 
            }} 
            className="font-medium text-accent hover:text-accent/80"
          >
            {isSignup ? t('signIn') : t('signUpNow')}
          </button>
        </p>
      </div>
    </div>
  );
};