import React from 'react';
import { ClinicSpaceListing } from '../../types';
import { Button } from '../common/Button';
import { PhotoIcon, MapPinIcon, WhatsAppIcon } from '../icons'; 
import { useTranslation } from '../../hooks/useTranslation';

interface ClinicSpaceCardProps {
  space: ClinicSpaceListing;
  onViewDetails: (space: ClinicSpaceListing) => void;
  clinicOwnerWhatsApp?: string;
}

export const ClinicSpaceCard: React.FC<ClinicSpaceCardProps> = ({ space, onViewDetails, clinicOwnerWhatsApp }) => {
  const { t, direction } = useTranslation();
  const primaryPhoto = space.photos && space.photos.length > 0 ? space.photos[0] : `https://picsum.photos/seed/${space.id}/500/350`;

  const handleConnect = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (clinicOwnerWhatsApp) {
      window.open(`https://wa.me/${clinicOwnerWhatsApp.replace(/\D/g, '')}?text=${encodeURIComponent(t('whatsappGreetingClinicSpace', { spaceName: space.name, clinicName: space.clinicName || t('yourClinic', {default: 'your clinic'}), appName: t('appName')}))}`, '_blank');
    }
  };

  return (
    <div className="bg-primary rounded-lg shadow-lg overflow-hidden flex flex-col h-full transition-all duration-300 ease-in-out hover:shadow-xl">
      <div className="relative w-full h-48 bg-gray-200">
        <img src={primaryPhoto} alt={space.name} className="w-full h-full object-cover" loading="lazy" />
      </div>
      <div className="p-4 flex flex-col flex-grow">
        <h3 className="text-lg font-semibold text-textOnLight mb-1 truncate" title={space.name}>
          {space.name}
        </h3>
        {space.clinicName && (
            <p className="text-xs text-gray-400 mb-1 flex items-center">
                <MapPinIcon className={`w-3 h-3 flex-shrink-0 ${direction === 'rtl' ? 'ml-1' : 'mr-1'}`} /> 
                <span className="truncate" title={space.clinicAddress}>{space.clinicAddress?.split(',').slice(0,2).join(', ') || space.clinicName}</span>
            </p>
        )}
        <p className="text-sm text-accent font-medium mb-2">
          ${space.rentalPrice} <span className="text-xs text-gray-500 font-normal">{space.rentalDuration}</span>
        </p>
        <p className="text-xs text-gray-600 line-clamp-2 mb-3 flex-grow">
          {space.description}
        </p>
        {space.features && space.features.length > 0 && (
          <p className="text-xs text-gray-500 mb-3 truncate">
            {t('featuresAndFacilitiesLabel', { default: "Features" })}: {space.features.slice(0, 2).join(', ')}{space.features.length > 2 ? '...' : ''}
          </p>
        )}
        <div className="mt-auto space-y-2">
            <Button 
                variant="secondary" 
                size="sm" 
                onClick={() => onViewDetails(space)} 
                className="w-full"
            >
            {t('viewDetailsButtonLabel', { default: "View Details" })}
            </Button>
            {clinicOwnerWhatsApp && (
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleConnect}
                    leftIcon={<WhatsAppIcon className="text-green-500" />}
                    className="w-full !text-green-600 hover:!bg-green-50 !border-green-500"
                >
                    {t('connectWithClinicOwnerButtonLabel', {default: "Chat with Owner"})}
                </Button>
            )}
        </div>
      </div>
    </div>
  );
};