
import React, { useState } from 'react';
import { ClinicSpaceListing } from '../../types';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { PhotoIcon, ChevronLeftIcon, ChevronRightIcon, MapPinIcon, WhatsAppIcon } from '../icons'; 
import { useTranslation } from '../../hooks/useTranslation';

interface ClinicSpaceDetailModalProps {
  space: ClinicSpaceListing | null;
  isOpen: boolean;
  onClose: () => void;
  clinicOwnerWhatsApp?: string;
}

export const ClinicSpaceDetailModal: React.FC<ClinicSpaceDetailModalProps> = ({ space, isOpen, onClose, clinicOwnerWhatsApp }) => {
  const { t, direction } = useTranslation();
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);

  if (!space) return null;

  const { name, photos, description, rentalPrice, rentalDuration, rentalTerms, features, clinicName, clinicAddress } = space;

  const handleNextPhoto = () => {
    setCurrentPhotoIndex((prevIndex) => (prevIndex + 1) % (photos?.length || 1));
  };

  const handlePrevPhoto = () => {
    setCurrentPhotoIndex((prevIndex) => (prevIndex - 1 + (photos?.length || 1)) % (photos?.length || 1));
  };
  
  const hasPhotos = photos && photos.length > 0;
  const currentPhotoUrl = hasPhotos ? photos[currentPhotoIndex] : `https://picsum.photos/seed/${space.id}-detail/600/400`;

  const handleConnect = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (clinicOwnerWhatsApp) {
      window.open(`https://wa.me/${clinicOwnerWhatsApp.replace(/\D/g, '')}?text=${encodeURIComponent(t('whatsappGreetingClinicSpace', { spaceName: space.name, clinicName: space.clinicName || t('yourClinic', {default: 'your clinic'}), appName: t('appName')}))}`, '_blank');
    }
  };


  return (
    <Modal isOpen={isOpen} onClose={onClose} title={name} size="2xl">
      <div className="space-y-5">
        {/* Photo Gallery */}
        <div className="relative w-full h-64 sm:h-80 bg-gray-200 rounded-lg overflow-hidden group">
          <img src={currentPhotoUrl} alt={`${name} - Photo ${currentPhotoIndex + 1}`} className="w-full h-full object-cover" loading="lazy" />
          {hasPhotos && photos.length > 1 && (
            <>
              <Button
                variant="light"
                size="sm"
                onClick={handlePrevPhoto}
                className={`!absolute top-1/2 left-2 transform -translate-y-1/2 !p-2 rounded-full opacity-70 group-hover:opacity-100 transition-opacity ${direction === 'rtl' ? '!right-2 !left-auto' : '' }`}
                aria-label={t('previousPhoto', { default: 'Previous Photo'})}
              >
                <ChevronLeftIcon className="w-5 h-5" />
              </Button>
              <Button
                variant="light"
                size="sm"
                onClick={handleNextPhoto}
                className={`!absolute top-1/2 right-2 transform -translate-y-1/2 !p-2 rounded-full opacity-70 group-hover:opacity-100 transition-opacity ${direction === 'rtl' ? '!left-2 !right-auto' : '' }`}
                aria-label={t('nextPhoto', { default: 'Next Photo'})}
              >
                <ChevronRightIcon className="w-5 h-5" />
              </Button>
              <div className="absolute bottom-2 left-1/2 transform -translate-x-1/2 bg-black/50 text-white text-xs px-2 py-0.5 rounded-full">
                {currentPhotoIndex + 1} / {photos.length}
              </div>
            </>
          )}
           {!hasPhotos && (
             <div className="absolute inset-0 flex items-center justify-center bg-gray-800/10">
                <PhotoIcon className="w-16 h-16 text-gray-400"/>
             </div>
           )}
        </div>
        
        {clinicName && clinicAddress && (
             <Section title={t('clinicInformationTitle', {default: 'Clinic Information'})}>
                <p className="text-gray-700 font-semibold">{clinicName}</p>
                <p className="text-sm text-gray-500 flex items-center">
                    <MapPinIcon className={`w-4 h-4 flex-shrink-0 ${direction === 'rtl' ? 'ml-1.5' : 'mr-1.5'}`} />
                    {clinicAddress}
                </p>
             </Section>
        )}

        <Section title={t('description', { default: "Description" })}>
          <p className="text-gray-600 whitespace-pre-wrap">{description}</p>
        </Section>

        <Section title={t('rentalInformationTitle', { default: "Rental Information" })}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
            <p><span className="font-medium text-gray-700">{t('rentalPriceField')}:</span> <span className="text-accent font-semibold">${rentalPrice}</span></p>
            <p><span className="font-medium text-gray-700">{t('rentalDurationField')}:</span> {rentalDuration}</p>
          </div>
          {rentalTerms && (
            <div className="mt-2">
              <p className="font-medium text-gray-700">{t('rentalTermsField')}:</p>
              <p className="text-sm text-gray-600 whitespace-pre-wrap">{rentalTerms}</p>
            </div>
          )}
        </Section>

        {features && features.length > 0 && (
          <Section title={t('featuresAndFacilitiesLabel', { default: "Features & Facilities" })}>
            <ul className={`list-disc list-inside grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-gray-600 ${direction === 'rtl' ? 'pr-4' : 'pl-4'}`}>
              {features.map((feature, index) => (
                <li key={index}>{feature}</li>
              ))}
            </ul>
          </Section>
        )}
        
         <div className="pt-4 border-t border-gray-200 flex flex-col sm:flex-row justify-end gap-3">
            {clinicOwnerWhatsApp && (
                 <Button 
                    variant="primary" 
                    onClick={handleConnect}
                    leftIcon={<WhatsAppIcon className="text-white"/>}
                    className="!bg-green-500 hover:!bg-green-600"
                >
                    {t('connectWithClinicOwnerButtonLabel', {default: "Chat with Owner"})}
                </Button>
            )}
            <Button variant="secondary" onClick={onClose}>
                {t('closeButtonLabel', {default: "Close"})}
            </Button>
        </div>
      </div>
    </Modal>
  );
};

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div>
    <h4 className="text-md font-semibold text-gray-500 uppercase tracking-wider mb-1.5 border-b border-gray-200 pb-1">{title}</h4>
    {children}
  </div>
);
