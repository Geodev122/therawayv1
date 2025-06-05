
import React, { useState, useEffect, FormEvent } from 'react';
import { Therapist, PracticeLocation, Certification } from '../../../types';
import { Button } from '../../common/Button';
import { InputField, TextareaField, SelectField, FileUploadField, CheckboxField } from '../shared/FormElements';
import { MapPinIcon, XIcon, ArrowDownTrayIcon, ArrowUpOnSquareIcon, VideoCameraIcon, DocumentDuplicateIcon } from '../../icons';
import { 
    LANGUAGES_LIST, 
    SPECIALIZATIONS_LIST,
    VIDEO_MAX_DURATION_SECONDS, 
    VIDEO_MAX_SIZE_MB,
    CERTIFICATION_MAX_SIZE_MB,
    PROFILE_PICTURE_MAX_SIZE_MB 
} from '../../../constants';
import { useTranslation } from '../../../hooks/useTranslation';


interface ProfileFormProps {
  therapist: Therapist | null; 
  onSave: (updatedTherapist: Therapist) => void;
  isLoading?: boolean;
}

const initialLocation: PracticeLocation = { address: '', isPrimary: false };

export const ProfileForm: React.FC<ProfileFormProps> = ({ therapist, onSave, isLoading }) => {
  const { t, direction } = useTranslation();
  const [formData, setFormData] = useState<Partial<Therapist>>(therapist || {});
  const [profilePictureFile, setProfilePictureFile] = useState<File | null>(null);
  const [introVideoFile, setIntroVideoFile] = useState<File | null>(null);
  // certificationFiles state is removed as we handle new certs within formData now

  useEffect(() => {
    setFormData(therapist || {});
    setProfilePictureFile(null);
    setIntroVideoFile(null);
  }, [therapist]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    if (type === 'checkbox') {
        const { checked } = e.target as HTMLInputElement;
        setFormData(prev => ({ ...prev, [name]: checked }));
    } else {
        setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleMultiSelectChange = (name: keyof Therapist, selectedOptions: string[]) => {
    setFormData(prev => ({ ...prev, [name]: selectedOptions }));
  };
  
  const handleSpecializationsChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selected = Array.from(e.target.selectedOptions, option => option.value);
    handleMultiSelectChange('specializations', selected);
  };

  const handleLanguagesChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selected = Array.from(e.target.selectedOptions, option => option.value);
    handleMultiSelectChange('languages', selected);
  };
  
  const handleQualificationsChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
     const qualificationsArray = e.target.value.split('\\n').map(q => q.trim()).filter(q => q);
     setFormData(prev => ({ ...prev, qualifications: qualificationsArray }));
  };


  const handleLocationChange = (index: number, field: keyof PracticeLocation, value: string | boolean) => {
    const newLocations = [...(formData.locations || [])];
    if (typeof newLocations[index][field] === 'boolean' && typeof value === 'string') {
        (newLocations[index] as any)[field] = Boolean(value);
    } else {
         (newLocations[index]as any)[field] = value;
    }
   
    if (field === 'isPrimary' && value === true) {
        newLocations.forEach((loc, i) => {
            if (i !== index) loc.isPrimary = false;
        });
    }
    setFormData(prev => ({ ...prev, locations: newLocations }));
  };

  const addLocation = () => {
    const newLocations = [...(formData.locations || []), { ...initialLocation, isPrimary: !(formData.locations || []).some(l => l.isPrimary) }];
    setFormData(prev => ({ ...prev, locations: newLocations }));
  };

  const removeLocation = (index: number) => {
    const newLocations = (formData.locations || []).filter((_, i) => i !== index);
    if (!newLocations.some(loc => loc.isPrimary) && newLocations.length > 0) {
        newLocations[0].isPrimary = true;
    }
    setFormData(prev => ({ ...prev, locations: newLocations }));
  };
  
  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    let updatedData = { ...formData };
    if (profilePictureFile) {
      updatedData.profilePictureUrl = URL.createObjectURL(profilePictureFile); 
    }
    if (introVideoFile) {
      updatedData.introVideoUrl = URL.createObjectURL(introVideoFile); 
    }
    // Certification files are handled within the Certifications page now, just pass existing certs
    updatedData.certifications = (formData.certifications || []).filter(c => c.name && c.fileUrl); 

    onSave(updatedData as Therapist); 
  };

  if (isLoading && !therapist) {
    return <div className="p-6 text-center text-textOnLight">{t('loading')}</div>;
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8 bg-primary p-6 sm:p-8 rounded-lg shadow-md">
      <h2 className="text-2xl font-semibold text-textOnLight border-b border-gray-200 pb-4 mb-6">{t('editYourProfile')}</h2>

      <section>
        <h3 className="text-lg font-medium text-accent mb-4">{t('basicInformation')}</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <InputField label={t('fullName')} id="name" name="name" value={formData.name || ''} onChange={handleChange} required />
          <InputField label={t('whatsappNumber')} id="whatsappNumber" name="whatsappNumber" type="tel" value={formData.whatsappNumber || ''} onChange={handleChange} placeholder="+12345678900" required />
        </div>
        <TextareaField label={t('bioAboutMe')} id="bio" name="bio" value={formData.bio || ''} onChange={handleChange} rows={5} required 
          description={t('bioDescription')} />
      </section>

      <section>
        <h3 className="text-lg font-medium text-accent mb-4 flex items-center"><VideoCameraIcon className={`w-5 h-5 ${direction === 'rtl' ? 'ms-2' : 'me-2'}`}/> {t('media')}</h3>
         <FileUploadField
            label={t('profilePicture')}
            id="profilePictureUrl"
            currentFileUrl={formData.profilePictureUrl}
            onFileChange={setProfilePictureFile}
            accept="image/jpeg, image/png, image/webp"
            maxSizeMB={PROFILE_PICTURE_MAX_SIZE_MB}
            description={t('profilePictureDescription', {size: PROFILE_PICTURE_MAX_SIZE_MB})}
            required={!formData.profilePictureUrl}
        />
        <FileUploadField
            label={t('introVideo', {duration: VIDEO_MAX_DURATION_SECONDS})}
            id="introVideoUrl"
            currentFileUrl={formData.introVideoUrl}
            onFileChange={setIntroVideoFile}
            accept="video/mp4, video/webm"
            maxSizeMB={VIDEO_MAX_SIZE_MB}
            description={t('introVideoDescription', {duration: VIDEO_MAX_DURATION_SECONDS, size: VIDEO_MAX_SIZE_MB})}
        />
      </section>

      <section>
        <h3 className="text-lg font-medium text-accent mb-4 flex items-center"><DocumentDuplicateIcon className={`w-5 h-5 ${direction === 'rtl' ? 'ms-2' : 'me-2'}`}/>{t('expertiseQualifications')}</h3>
        <div className="mb-4">
            <label htmlFor="specializations" className="block text-sm font-medium text-gray-700 mb-1">{t('specializationsMultiSelect')}</label>
            <select 
                id="specializations" 
                name="specializations"
                multiple 
                value={formData.specializations || []} 
                onChange={handleSpecializationsChange}
                className="mt-1 block w-full h-40 px-3 py-2 border border-gray-300 bg-primary text-textOnLight rounded-md shadow-sm focus:outline-none focus:ring-accent focus:border-accent sm:text-sm"
            >
                {SPECIALIZATIONS_LIST.map(spec => <option key={spec} value={spec}>{spec}</option>)}
            </select>
            <p className="mt-1 text-xs text-gray-500">{t('multiSelectHint')}</p>
        </div>
        <div className="mb-4">
            <label htmlFor="languages" className="block text-sm font-medium text-gray-700 mb-1">{t('languagesMultiSelect')}</label>
            <select 
                id="languages" 
                name="languages"
                multiple
                value={formData.languages || []} 
                onChange={handleLanguagesChange}
                className="mt-1 block w-full h-32 px-3 py-2 border border-gray-300 bg-primary text-textOnLight rounded-md shadow-sm focus:outline-none focus:ring-accent focus:border-accent sm:text-sm"
            >
                {LANGUAGES_LIST.map(lang => <option key={lang} value={lang}>{lang}</option>)}
            </select>
             <p className="mt-1 text-xs text-gray-500">{t('multiSelectHint')}</p>
        </div>
        <TextareaField label={t('qualificationsCredentials')} id="qualifications" name="qualifications" 
            value={(formData.qualifications || []).join('\\n')} 
            onChange={handleQualificationsChange}
            rows={4} description={t('qualificationsDescription')} />
      </section>
      
      <section>
        <h3 className="text-lg font-medium text-accent mb-4 flex items-center">
            <MapPinIcon className={`w-5 h-5 ${direction === 'rtl' ? 'ms-2' : 'me-2'}`}/> {t('practiceLocations')}
        </h3>
        {(formData.locations || []).map((loc, index) => (
          <div key={index} className="p-4 border border-gray-200 rounded-md mb-4 relative bg-gray-50/50">
            <InputField 
              label={`${t('location', {default: 'Location'})} ${index + 1} ${t('address', {default: 'Address'})}`}
              id={`location_address_${index}`} 
              name={`location_address_${index}`}
              value={loc.address} 
              onChange={(e) => handleLocationChange(index, 'address', e.target.value)} 
              containerClassName="mb-2"
              required
            />
            <CheckboxField
                label={t('setAsPrimaryLocation', {default: 'Set as Primary Location'})}
                id={`location_isPrimary_${index}`}
                checked={loc.isPrimary || false}
                onChange={(e) => handleLocationChange(index, 'isPrimary', e.target.checked)}
            />
            <Button 
                type="button" 
                variant="danger" 
                size="sm" 
                onClick={() => removeLocation(index)}
                className={`!absolute top-3 ${direction === 'rtl' ? 'left-3' : 'right-3'} !p-1.5`}
                aria-label={t('removeLocation', {default: 'Remove location'})}
            >
                <XIcon className="w-4 h-4" />
            </Button>
          </div>
        ))}
        <Button type="button" variant="secondary" onClick={addLocation} leftIcon={<span className={`text-lg font-bold ${direction === 'rtl' ? 'ms-2' : 'me-2'}`}>+</span>}>
          {t('addAnotherLocation')}
        </Button>
      </section>

      <div className="pt-6 border-t border-gray-200">
        <Button type="submit" variant="primary" size="lg" disabled={isLoading} leftIcon={<ArrowDownTrayIcon className={`w-5 h-5 ${direction === 'rtl' ? 'ms-2' : 'me-2'}`}/>}>
          {isLoading ? t('saving') : t('saveProfile')}
        </Button>
      </div>
    </form>
  );
};