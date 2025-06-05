
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
// Mock data imports (MOCK_USERS_FOR_ADMIN, MOCK_THERAPISTS, MOCK_CLINICS) are removed as demo login is removed.
import { UserCircleIcon, ExclamationTriangleIcon } from '../icons'; 
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from '../../hooks/useTranslation';
import { UserRole } from '../../types';

interface LoginPromptModalProps {
  isOpen: boolean;
  onClose: () => void;
  actionAttempted?: string | null;
}

export const LoginPromptModal: React.FC<LoginPromptModalProps> = ({ isOpen, onClose, actionAttempted }) => {
  const navigate = useNavigate();
  // const { login } = useAuth(); // login from useAuth is for the main login form, not direct demo login.
  const { t, direction } = useTranslation();

  // handleDirectLogin function is removed as demo buttons are removed.

  const handleLoginRedirect = () => {
    onClose();
    navigate('/login', { state: { fromAction: actionAttempted || 'interaction' } });
  };

  const handleSignupRedirect = () => {
    onClose();
    navigate('/login', { state: { fromAction: actionAttempted || 'interaction', isSigningUp: true } });
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('authenticationRequired')} size="lg">
      <div className="text-center relative">
        <ExclamationTriangleIcon className="w-16 h-16 text-yellow-400 mx-auto mb-4" />
        <h3 className="text-xl font-semibold text-textOnLight mb-2">{t('pleaseSignInOrSignUp')}</h3>
        <p className="text-gray-600 mb-6">
          {t('authModalMessage', { action: actionAttempted || t('continueAction', {default: "continue with this action"}), appName: t('appName')})}
        </p>
        <div className="space-y-3 sm:space-y-0 sm:flex sm:flex-row-reverse sm:gap-3 mb-6">
          <Button 
            variant="primary" 
            onClick={handleLoginRedirect}
            isFullWidth 
            className="sm:ml-3"
            leftIcon={<UserCircleIcon className={`w-5 h-5 ${direction === 'rtl' ? 'ms-2' : 'me-2'}`}/>}
          >
            {t('signInManually')}
          </Button>
          <Button 
            variant="secondary" 
            onClick={handleSignupRedirect} 
            isFullWidth
          >
            {t('createAccount')}
          </Button>
        </div>

        {/* Demo account buttons removed for live deployment */}
        {/* 
        <div className="mt-6 pt-6 border-t border-gray-200">
            <h4 className="text-md font-semibold text-gray-700 mb-3">{t('tryDemoAccount')}</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                 <Button variant="ghost" onClick={() => handleDirectLogin(UserRole.CLIENT)} leftIcon={<UserCircleIcon className={`text-blue-500 ${direction === 'rtl' ? 'ms-2' : 'me-2'}`}/>} isFullWidth className="!text-blue-500 hover:!bg-blue-50">{t('demoAsClient')}</Button>
                 <Button variant="ghost" onClick={() => handleDirectLogin(UserRole.THERAPIST)} leftIcon={<BriefcaseIcon className={`text-teal-500 ${direction === 'rtl' ? 'ms-2' : 'me-2'}`}/>} isFullWidth className="!text-teal-500 hover:!bg-teal-50">{t('demoAsTherapist')}</Button>
                 <Button variant="ghost" onClick={() => handleDirectLogin(UserRole.CLINIC_OWNER)} leftIcon={<BuildingOfficeIcon className={`text-purple-500 ${direction === 'rtl' ? 'ms-2' : 'me-2'}`}/>} isFullWidth className="!text-purple-500 hover:!bg-purple-50">{t('demoAsClinicOwner')}</Button>
                 <Button variant="ghost" onClick={() => handleDirectLogin(UserRole.ADMIN)} leftIcon={<ShieldCheckIcon className={`text-red-500 ${direction === 'rtl' ? 'ms-2' : 'me-2'}`}/>} isFullWidth className="!text-red-500 hover:!bg-red-50">{t('demoAsAdmin')}</Button>
            </div>
        </div>
        */}

         <button 
            onClick={onClose}
            className="mt-8 text-sm text-gray-500 hover:text-gray-700"
        >
            {t('maybeLater')}
        </button>
      </div>
    </Modal>
  );
};
