import React, {useState} from 'react';
import { Therapist } from '../../types';
import { StarIcon, MapPinIcon, PlayIcon, InformationCircleIcon, FlowerTickIcon } from '../icons';
import { useTranslation } from '../../hooks/useTranslation';

interface SwipableTherapistCardProps {
  therapist: Therapist;
  onViewProfile: () => void;
}

export const SwipableTherapistCard: React.FC<SwipableTherapistCardProps> = ({ therapist, onViewProfile }) => {
  const [showVideo, setShowVideo] = useState(false);
  const { t, direction } = useTranslation();

  const handleVideoToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (therapist.introVideoUrl) {
      setShowVideo(!showVideo);
    } else {
      onViewProfile(); // Or some other indication that there's no video
    }
  };

  return (
    <div
        className="w-full h-full bg-primary rounded-3xl shadow-2xl overflow-hidden flex flex-col cursor-pointer active:cursor-grabbing relative select-none group"
        onClick={onViewProfile}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onViewProfile(); }}
        aria-label={`${t('viewProfileFor', { name: therapist.name, default: `View profile for ${therapist.name}`})}`}
    >
      {/* Image/Video Area - Now flex-grow */}
      <div
        className="relative w-full flex-grow min-h-0 bg-gray-300" 
        onClick={handleVideoToggle}
        role="button"
        aria-label={therapist.introVideoUrl ? t('toggleIntroVideo', {default: "Toggle intro video"}) : t('profileImageOf', { name: therapist.name, default: `Profile image of ${therapist.name}`})}
      >
        {showVideo && therapist.introVideoUrl ? (
           <video
            src={therapist.introVideoUrl}
            controls
            autoPlay
            playsInline
            className="w-full h-full object-cover"
            onClick={(e) => e.stopPropagation()}
            onEnded={() => setShowVideo(false)}
            aria-label={t('introVideoOf', { name: therapist.name, default: `Intro video of ${therapist.name}`})}
          >
            {t('videoNotSupported', {default: "Your browser does not support the video tag."})}
          </video>
        ) : (
          <img
            src={therapist.profilePictureUrl}
            alt={t('profileOf', { name: therapist.name, default: `Profile of ${therapist.name}`})}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        )}

        {/* Gradient Overlay for Text on Image */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/40 to-transparent pointer-events-none"></div>

        {/* Play/Info Icon */}
        {!showVideo && (
            <div className={`absolute inset-0 flex items-center justify-center transition-opacity ${therapist.introVideoUrl ? 'opacity-0 group-hover:opacity-100' : 'opacity-100'}`}>
                 {therapist.introVideoUrl ? (
                    <PlayIcon className="w-16 h-16 text-white/80 drop-shadow-lg\" title={t('playIntroVideo', {default: "Play intro video"})}/>
                 ) : (
                    <InformationCircleIcon className="w-12 h-12 text-white/50 drop-shadow-lg" title={t('noIntroVideoAvailable', {default: "No intro video available"})}/>
                 )}
            </div>
        )}

        {/* Name & Verification Icon on Image Area */}
        <div className={`absolute bottom-0 left-0 right-0 p-1.5 sm:p-2 text-white ${direction === 'rtl' ? 'text-right' : 'text-left'}`}>
          <div className="flex items-center">
            <h2 className="text-xl sm:text-2xl font-bold truncate" title={therapist.name}>
              {therapist.name}
            </h2>
            {therapist.isVerified && (
              <FlowerTickIcon className={`w-5 h-5 sm:w-6 sm:h-6 text-accent flex-shrink-0 ${direction === 'rtl' ? 'mr-2' : 'ml-2'}`} title={t('verified')}/>
            )}
          </div>
           <p className="text-xs sm:text-sm text-white/80 truncate">
            {therapist.specializations[0]}
            {therapist.specializations.length > 1 ? ` & ${therapist.specializations.length -1} more` : ""}
          </p>
        </div>
      </div>

      {/* Information Panel - Now flex-shrink-0 and h-auto */}
      <div className={`flex-shrink-0 h-auto p-0.5 sm:p-1 flex flex-col bg-primary text-textOnLight ${direction === 'rtl' ? 'text-right' : 'text-left'} overflow-hidden`}>
        <div> {/* Top part of info panel (rating, location, languages) */}
          <div className={`flex items-center text-xs sm:text-sm text-gray-600 mb-0.5`}>
            <StarIcon className={`w-4 h-4 sm:w-5 sm:h-5 text-yellow-400 ${direction === 'rtl' ? 'ml-1.5' : 'mr-1.5'}`} />
            <span className="text-gray-700 font-semibold">{therapist.rating.toFixed(1)}</span>
            <span className="text-gray-500 mx-1">&bull;</span>
            <span className="text-gray-500">{therapist.reviewCount} {t('reviews', {default: 'reviews'})}</span>
          </div>

          <div className={`flex items-center text-xs sm:text-sm text-gray-500 mb-0.5 truncate`}>
            <MapPinIcon className={`w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-400 flex-shrink-0 ${direction === 'rtl' ? 'ml-1.5' : 'mr-1.5'}`} />
            <span className="truncate" title={therapist.locations[0]?.address}>
              {therapist.locations[0]?.address.split(',').slice(0,2).join(', ') || t('onlinePractice', {default: 'Online Practice'})}
            </span>
          </div>

          <p className="text-xs sm:text-sm text-gray-500 truncate">
            {t('languages')}: {therapist.languages.slice(0,2).join(', ')}{therapist.languages.length > 2 ? '...' : ''}
          </p>
        </div>

        {/* Tap for details hint - Bottom part of info panel */}
        <div className="mt-0.5 text-center text-[10px] sm:text-xs text-gray-400 border-t border-gray-200 pt-0.5">
          {t('tapCardForDetails')}
        </div>
      </div>
    </div>
  );
};