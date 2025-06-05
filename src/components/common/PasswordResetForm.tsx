import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from '../../hooks/useTranslation';
import { Button } from './Button';
import { InputField } from '../dashboard/shared/FormElements';

interface PasswordResetFormProps {
  onSuccess?: () => void;
  onCancel?: () => void;
}

export const PasswordResetForm: React.FC<PasswordResetFormProps> = ({ onSuccess, onCancel }) => {
  const { t } = useTranslation();
  const { resetUserPassword, authLoading } = useAuth();
  
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    
    if (!email) {
      setError(t('emailRequired', { default: 'Email is required' }));
      return;
    }
    
    try {
      await resetUserPassword(email);
      setSuccess(true);
    } catch (error: any) {
      setError(error.message || t('passwordResetError', { default: 'Failed to send password reset email' }));
    }
  };
  
  if (success) {
    return (
      <div className="p-4 bg-green-100 text-green-700 rounded-md text-center">
        <p className="font-medium">{t('passwordResetEmailSent', { default: 'Password reset email sent!' })}</p>
        <p className="text-sm mt-2">{t('passwordResetInstructions', { default: 'Check your email for instructions to reset your password.' })}</p>
        <Button variant="primary" className="mt-4" onClick={onSuccess}>
          {t('continue', { default: 'Continue' })}
        </Button>
      </div>
    );
  }
  
  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="p-3 bg-red-100 text-red-700 rounded-md text-sm">
          {error}
        </div>
      )}
      
      <p className="text-sm text-gray-600 mb-4">
        {t('passwordResetDescription', { default: 'Enter your email address and we will send you instructions to reset your password.' })}
      </p>
      
      <InputField
        label={t('emailAddress', { default: 'Email Address' })}
        id="email"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
      />
      
      <div className="flex justify-end space-x-3 pt-2">
        {onCancel && (
          <Button variant="light" onClick={onCancel} disabled={authLoading}>
            {t('cancel', { default: 'Cancel' })}
          </Button>
        )}
        
        <Button variant="primary" type="submit" disabled={authLoading}>
          {authLoading ? t('sending', { default: 'Sending...' }) : t('sendResetLink', { default: 'Send Reset Link' })}
        </Button>
      </div>
    </form>
  );
};