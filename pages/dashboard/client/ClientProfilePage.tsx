
import React, { useState, useEffect, FormEvent } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { useTranslation } from '../../../hooks/useTranslation';
import { usePageTitle } from '../../../hooks/usePageTitle';
import { Button } from '../../../components/common/Button';
import { InputField, FileUploadField } from '../../../components/dashboard/shared/FormElements';
import { ArrowUpOnSquareIcon, UserCircleIcon } from '../../../components/icons';
import { PROFILE_PICTURE_MAX_SIZE_MB, API_BASE_URL } from '../../../constants';

export const ClientProfilePage: React.FC = () => {
  const { user, token, authLoading, updateUserAuthContext } = useAuth(); 
  const { t, direction } = useTranslation();
  usePageTitle('clientProfilePageTitle');

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [profilePictureUrl, setProfilePictureUrl] = useState<string | null>(null);
  const [profilePictureFile, setProfilePictureFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false); 
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      setName(user.name || '');
      setEmail(user.email || '');
      setProfilePictureUrl(user.profilePictureUrl || null);
    }
  }, [user]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user || !token) {
      setError("Authentication error. Please log in again.");
      return;
    }
    setIsLoading(true);
    setError(null);
    setSuccessMessage(null);

    let newProfilePictureUrl = profilePictureUrl;

    // TODO: Implement actual API call for file upload
    if (profilePictureFile) {
      const formData = new FormData();
      formData.append('profilePicture', profilePictureFile);
      formData.append('uploadType', 'profilePicture'); // Example: to categorize uploads

      try {
        const uploadResponse = await fetch(`${API_BASE_URL}/upload.php`, {
          method: 'POST',
          headers: {
            // 'Content-Type': 'multipart/form-data' is set automatically by browser for FormData
            'Authorization': `Bearer ${token}`,
          },
          body: formData,
        });
        const uploadData = await uploadResponse.json();
        if (uploadData.status === 'success' && uploadData.fileUrl) {
          newProfilePictureUrl = uploadData.fileUrl;
        } else {
          throw new Error(uploadData.message || 'File upload failed.');
        }
      } catch (uploadErr: any) {
        setError(`File upload error: ${uploadErr.message}`);
        setIsLoading(false);
        return;
      }
    }

    // TODO: Implement actual API call for profile update
    try {
      const profileUpdatePayload = {
        name,
        email,
        profilePictureUrl: newProfilePictureUrl,
      };

      const response = await fetch(`${API_BASE_URL}/user_profile.php`, {
        method: 'PUT', // Assuming PUT for updates
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(profileUpdatePayload),
      });
      const data = await response.json();

      if (data.status === 'success' && data.user) {
        updateUserAuthContext(data.user); // Update context with potentially updated user data from backend
        setProfilePictureUrl(data.user.profilePictureUrl); // Ensure local state matches context
        setSuccessMessage(t('clientAccountSavedSuccess'));
        setProfilePictureFile(null);
      } else {
        throw new Error(data.message || 'Profile update failed.');
      }
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred while saving profile.');
    } finally {
      setIsLoading(false);
    }
  };

  if (authLoading || (!user && isLoading)) {
    return <div className="p-6 text-center text-textOnLight">{t('loading')}</div>;
  }
  if (!user) {
    return <div className="p-6 text-center text-textOnLight">{t('pleaseLoginToViewProfile', {default: 'Please log in to view your profile.'})}</div>;
  }

  return (
    <div className="container mx-auto max-w-2xl flex-grow flex flex-col py-6 px-4 overflow-hidden">
      {/* This outer div is now overflow-hidden and flex-grow to fill space */}
      <div className="bg-primary p-6 sm:p-8 rounded-xl shadow-xl w-full flex-grow flex flex-col overflow-hidden">
        {/* Inner card is also overflow-hidden */}
        <div className="flex items-center mb-6 pb-4 border-b border-gray-200">
            {(profilePictureUrl || user.profilePictureUrl) ? ( // Check both local state and user context
                <img src={profilePictureUrl || user.profilePictureUrl || undefined} alt={t('profilePicture')} className="w-20 h-20 sm:w-24 sm:h-24 rounded-full object-cover mr-4 border-2 border-accent" loading="lazy" />
            ) : (
                <UserCircleIcon className={`w-20 h-20 sm:w-24 sm:h-24 text-gray-300 ${direction === 'rtl' ? 'ms-4' : 'me-4'}`} />
            )}
            <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-accent">{t('clientProfileManagementTab')}</h1>
            </div>
        </div>

        {error && <p className="mb-4 p-3 bg-red-100 text-red-700 rounded-md text-sm">{error}</p>}
        {successMessage && <p className="mb-4 p-3 bg-green-100 text-green-700 rounded-md text-sm">{successMessage}</p>}

        {/* Form takes full height of its parent card and manages internal distribution */}
        <form onSubmit={handleSubmit} className="space-y-6 flex flex-col flex-grow h-full overflow-hidden">
          {/* Input section uses flex-grow to take available space, but is also overflow-hidden */}
          <div className="flex-grow overflow-hidden space-y-6">
            <FileUploadField
              label={t('profilePicture')}
              id="profilePictureFile"
              currentFileUrl={profilePictureUrl} 
              onFileChange={(file) => {
                setProfilePictureFile(file);
                if (file) setProfilePictureUrl(URL.createObjectURL(file)); // Optimistic UI update for preview
                else if (user.profilePictureUrl) setProfilePictureUrl(user.profilePictureUrl); // Revert to original if file cleared
              }}
              accept="image/jpeg, image/png, image/webp"
              maxSizeMB={PROFILE_PICTURE_MAX_SIZE_MB}
              description={t('profilePictureDescription', { size: PROFILE_PICTURE_MAX_SIZE_MB })}
            />
            <InputField
              label={t('fullName')}
              id="name"
              name="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
            <InputField
              label={t('emailAddress')}
              id="email"
              name="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          {/* Button section stays at the bottom */}
          <div className="pt-2 mt-auto flex-shrink-0">
            <Button type="submit" variant="primary" size="lg" disabled={isLoading || authLoading} leftIcon={<ArrowUpOnSquareIcon />}>
              {isLoading || authLoading ? t('saving') : t('saveChangesButtonLabel')}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
