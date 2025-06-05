
import React from 'react';
import { Therapist } from '../types';
import { StarIcon, HeartIcon, MapPinIcon, WhatsAppIcon } from './icons';
import { Button } from './common/Button';

interface TherapistCardProps {
  therapist: Therapist;
  onViewProfile: (therapist: Therapist) => void;
  onToggleFavorite: (therapistId: string) => void;
  isFavorite: boolean;
}

export const TherapistCard: React.FC<TherapistCardProps> = ({ therapist, onViewProfile, onToggleFavorite, isFavorite }) => {
  const handleWhatsAppClick = (e: React.MouseEvent) => {
    e.stopPropagation(); 
    window.open(`https://wa.me/${therapist.whatsappNumber.replace(/\D/g, '')}?text=Hello%20Dr.%20${therapist.name.split(' ').pop()},%20I%20found%20you%20on%20TheraWay.`, '_blank');
  };

  return (
    <div 
      className="bg-primary rounded-xl shadow-lg overflow-hidden flex flex-col h-full transition-all duration-300 ease-in-out hover:shadow-xl hover:-translate-y-1" 
      onClick={() => onViewProfile(therapist)}
    >
      <div className="relative">
        <img 
            className="w-full h-52 object-cover" 
            src={therapist.profilePictureUrl} 
            alt={`Profile of ${therapist.name}`}
            loading="lazy" 
        />
        <button
          onClick={(e) => { e.stopPropagation(); onToggleFavorite(therapist.id); }}
          className="absolute top-3 right-3 bg-primary/80 backdrop-blur-sm p-2 rounded-full shadow-md hover:bg-red-100 transition-colors text-textOnLight/70 hover:text-red-500"
          aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
        >
          <HeartIcon className={`w-5 h-5 ${isFavorite ? 'text-red-500' : ''}`} filled={isFavorite} />
        </button>
      </div>

      <div className="p-5 flex flex-col flex-grow">
        <h3 className="text-xl font-semibold text-textOnLight mb-1 truncate" title={therapist.name}>{therapist.name}</h3>
        <div className="flex items-center mb-2 text-sm text-yellow-400">
          {[...Array(5)].map((_, i) => (
            <StarIcon key={i} filled={i < Math.round(therapist.rating)} className={`w-4 h-4 ${i < Math.round(therapist.rating) ? 'text-yellow-400' : 'text-gray-300'}`} />
          ))}
          <span className="ml-1.5 text-textOnLight/70 text-xs">({therapist.rating.toFixed(1)} from {therapist.reviewCount} reviews)</span>
        </div>
        
        <p className="text-xs text-textOnLight/60 mb-1">Specializes in: <span className="font-medium text-textOnLight/80">{therapist.specializations.slice(0,2).join(', ')}</span></p>
        <p className="text-xs text-textOnLight/60 mb-3 flex items-center">
            <MapPinIcon className="inline w-3.5 h-3.5 mr-1.5 text-accent flex-shrink-0" /> 
            <span className="truncate" title={therapist.locations[0]?.address}>{therapist.locations[0]?.address.split(',').slice(0,2).join(',') || 'Online Practice'}</span>
        </p>
        
        <p className="text-sm text-textOnLight/70 mb-4 line-clamp-3 flex-grow leading-relaxed">{therapist.bio}</p>

        <div className="mt-auto pt-3 border-t border-gray-100">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <Button 
                variant="primary" 
                size="sm" 
                className="w-full sm:w-auto flex-1 !bg-accent !text-textOnDark hover:!bg-accent/90" // Updated button style
                onClick={(e) => { e.stopPropagation(); onViewProfile(therapist); }}
            >
                View Profile
            </Button>
            <Button 
                variant="ghost" 
                size="sm" 
                className="w-full sm:w-auto flex-1 border !border-highlight !text-highlight hover:!bg-highlight/10" // Updated button style
                onClick={handleWhatsAppClick}
                leftIcon={<WhatsAppIcon className="text-green-500"/>}
            >
                Chat Now
            </Button>
            </div>
        </div>
      </div>
    </div>
  );
};
