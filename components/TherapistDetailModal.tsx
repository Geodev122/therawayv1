import React from 'react';
import { Therapist } from '../types';
import { Modal } from './common/Modal';
import { StarIcon, HeartIcon, MapPinIcon, WhatsAppIcon } from './icons';
import { Button } from './common/Button';
import { useTranslation } from '../hooks/useTranslation';
import { usePageTitle } from '../hooks/usePageTitle';


interface TherapistDetailModalProps {
  therapist: Therapist | null;
  isOpen: boolean;
  onClose: () => void;
  onToggleFavorite: (therapistId: string) => void;
  isFavorite: boolean;
}

export const TherapistDetailModal: React.FC<TherapistDetailModalProps> = ({ therapist, isOpen, onClose, onToggleFavorite, isFavorite }) => {
  const { t, direction } = useTranslation();
  
  // Set page title when modal is open for a therapist
  usePageTitle(therapist && isOpen ? 'therapistDetailTitle' : 'appName', therapist && isOpen ? {name: therapist.name} : undefined);


  if (!therapist) return null;

  const handleWhatsAppClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    const cleanWhatsAppNumber = therapist.whatsappNumber.replace(/\D/g, '');
    const therapistLastName = therapist.name.split(' ').pop() || '';
    const whatsappMessage = encodeURIComponent(t('whatsappGreeting', { name: therapistLastName, appName: t('appName') }) || `Hello Dr. ${therapistLastName}, I found you on ${t('appName')}.`);
    window.open(`https://wa.me/${cleanWhatsAppNumber}?text=${whatsappMessage}`, '_blank');
  };
  
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={therapist.name} size="2xl">
        <div className="flex flex-col lg:flex-row gap-6 sm:gap-8">
            <div className="lg:w-1/3 flex-shrink-0">
                <img 
                    src={therapist.profilePictureUrl} 
                    alt={`Profile of ${therapist.name}`} 
                    className="rounded-lg shadow-md w-full h-auto object-cover aspect-square mb-4"
                />
                 <Button
                    isFullWidth
                    onClick={(e) => { e.stopPropagation(); onToggleFavorite(therapist.id); }}
                    className="mb-2"
                    variant={isFavorite ? "secondary" : "primary"}
                    leftIcon={<HeartIcon className={`w-5 h-5 ${isFavorite ? 'text-red-500' : 'text-background'} ${direction === 'rtl' ? 'ms-2' : 'me-2'}`} filled={isFavorite} />}
                >
                    {isFavorite ? t('removeFromFavorites') : t('addToFavorites')}
                </Button>
                 <Button 
                    variant="primary" 
                    size="md" 
                    isFullWidth
                    onClick={handleWhatsAppClick}
                    leftIcon={<WhatsAppIcon className={`text-white ${direction === 'rtl' ? 'ms-2' : 'me-2'}`}/>}
                >
                    {t('connectOnWhatsApp')}
                </Button>
            </div>
            <div className="lg:w-2/3">
                <div className="flex items-center mb-3">
                    {[...Array(5)].map((_, i) => (
                        <StarIcon key={i} filled={i < Math.round(therapist.rating)} className={`w-5 h-5 ${i < Math.round(therapist.rating) ? 'text-yellow-400' : 'text-gray-300'}`} />
                    ))}
                    <span className={`${direction === 'rtl' ? 'me-2' : 'ms-2'} text-gray-700`}>({therapist.rating.toFixed(1)} {t('from', {default: 'from'})} {therapist.reviewCount} {t('reviews', {default: 'reviews'})})</span>
                </div>

                <Section title={t('about')}>
                    <p className="text-gray-600 leading-relaxed whitespace-pre-wrap">{therapist.bio}</p>
                </Section>

                <Section title={t('specializations')}>
                    <div className="flex flex-wrap gap-2">
                        {therapist.specializations.map(spec => (
                            <span key={spec} className="bg-secondary text-accent px-3 py-1 rounded-full text-sm font-medium">{spec}</span>
                        ))}
                    </div>
                </Section>

                <Section title={t('languagesSpoken')}>
                    <p className="text-gray-600">{therapist.languages.join(', ')}</p>
                </Section>

                <Section title={t('qualifications')}>
                 <ul className={`list-disc list-inside text-gray-600 space-y-1 ${direction === 'rtl' ? 'pr-4' : 'ps-4'}`}>
                    {therapist.qualifications.map(q => <li key={q}>{q}</li>)}
                </ul>
                </Section>
                
                <Section title={t('practiceLocations')}>
                    {therapist.locations.map((loc, index) => (
                         <div key={index} className="text-gray-600 mb-2 flex items-start">
                            <MapPinIcon className={`w-5 h-5 text-accent flex-shrink-0 mt-1 ${direction === 'rtl' ? 'ms-2.5' : 'me-2.5'}`} /> 
                            <span>{loc.address}</span>
                        </div>
                    ))}
                    <div className="mt-3 h-48 bg-gray-200 rounded-lg flex items-center justify-center text-gray-500">
                        <MapPinIcon className={`w-8 h-8 text-gray-400 ${direction === 'rtl' ? 'ms-2' : 'me-2'}`}/> {t('interactiveMapPlaceholder')}
                    </div>
                </Section>
            </div>
        </div>
    </Modal>
  );
};

const Section: React.FC<{title: string; children: React.ReactNode}> = ({title, children}) => (
    <div className="mb-5">
        <h4 className="text-md font-semibold text-gray-500 uppercase tracking-wider mb-2 border-b border-gray-200 pb-1">{title}</h4>
        {children}
    </div>
);