import React, { useState } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { useTranslation } from '../../../hooks/useTranslation';
import { Button } from './Button';
import { InputField } from '../dashboard/shared/FormElements';

interface PasswordChangeFormProps {
  onSuccess?: () => void;
  onCancel?: () => void;
}

export const PasswordChangeForm: React.FC<PasswordChangeFormProps> = ({ onSuccess, onCancel }) => {
  const { t } = useTranslation();
  const { changeUserPassword, authLoading } = useAuth();
  
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    
    // Validate passwords
    if (!currentPassword || !newPassword || !confirmPassword) {
      setError(t('allFieldsRequired', { default: 'All fields are required' }));
      return;
    }
    
    if (newPassword !== confirmPassword) {
      setError(t('passwordsDoNotMatch', { default: 'New passwords do not match' }));
      return;
    }
    
    if (newPassword.length < 6) {
      setError(t('passwordTooShort', { default: 'Password must be at least 6 characters long' }));
      return;
    }
    
    try {
      await changeUserPassword(currentPassword, newPassword);
      setSuccess(true);
      if (onSuccess) onSuccess();
    } catch (error: any) {
      setError(error.message || t('passwordChangeError', { default: 'Failed to change password' }));
    }
  };
  
  if (success) {
    return (
      <div className="p-4 bg-green-100 text-green-700 rounded-md text-center">
        <p className="font-medium">{t('passwordChangeSuccess', { default: 'Password changed successfully!' })}</p>
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
      
      <InputField
        label={t('currentPassword', { default: 'Current Password' })}
        id="currentPassword"
        type="password"
        value={currentPassword}
        onChange={(e) => setCurrentPassword(e.target.value)}
        required
      />
      
      <InputField
        label={t('newPassword', { default: 'New Password' })}
        id="newPassword"
        type="password"
        value={newPassword}
        onChange={(e) => setNewPassword(e.target.value)}
        required
      />
      
      <InputField
        label={t('confirmNewPassword', { default: 'Confirm New Password' })}
        id="confirmPassword"
        type="password"
        value={confirmPassword}
        onChange={(e) => setConfirmPassword(e.target.value)}
        required
      />
      
      <div className="flex justify-end space-x-3 pt-2">
        {onCancel && (
          <Button variant="light\" onClick={onCancel} disabled={authLoading}>
            {t('cancel', { default: 'Cancel' })}
          </Button>
        )}
        
        <Button variant="primary" type="submit" disabled={authLoading}>
          {authLoading ? t('changing', { default: 'Changing...' }) : t('changePassword', { default: 'Change Password' })}
        </Button>
      </div>
    </form>
  );
};