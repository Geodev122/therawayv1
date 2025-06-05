import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Therapist, UserRole } from '../types';
import { API_BASE_URL, APP_NAME, AVAILABILITY_OPTIONS, SPECIALIZATIONS_LIST, LANGUAGES_LIST } from '../constants'; 
import { TherapistDetailModal } from '../components/TherapistDetailModal';
import { Button } from '../components/common/Button';
import { SwipableTherapistCard } from '../components/therapist-finder/SwipableTherapistCard';
import { TherapistCard } from '../components/TherapistCard';
import { TherapistMapView } from '../components/therapist-finder/TherapistMapView';
import { Modal } from '../components/common/Modal';
import { InputField, SelectField, CheckboxField } from '../components/dashboard/shared/FormElements';
import { useTranslation } from '../hooks/useTranslation';
import { usePageTitle } from '../hooks/usePageTitle';

import {
    HeartIcon, ChevronLeftIcon, ChevronRightIcon, WhatsAppIcon, InformationCircleIcon,
    AdjustmentsHorizontalIcon, TableCellsIcon, MapIcon, ListBulletIcon, XIcon, FilterSolidIcon
} from '../components/icons';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';


type ViewMode = 'swipe' | 'grid' | 'map';

interface Filters {
    searchTerm: string;
    specializations: string[];
    languages: string[];
    minRating: number;
    availability: string[];
    locationSearch: string;
    showOnlyLiked?: boolean;
}

const ITEMS_PER_PAGE_GRID = 9;
const NAVBAR_HEIGHT_PX = 64; 
const BOTTOM_NAV_HEIGHT_PX = 56; 
const ACTION_BUTTONS_SWIPE_AREA_HEIGHT_PX = 80;
const API_TIMEOUT_MS = 10000; // Timeout for API calls

const useSwipeKeyboardControls = (onSwipeLeft: () => void, onSwipeRight: () => void, onSwipeUp: () => void, enabled: boolean) => {
  useEffect(() => {
    if (!enabled) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft') onSwipeLeft();
      if (event.key === 'ArrowRight') onSwipeRight();
      if (event.key === 'ArrowUp') onSwipeUp();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onSwipeLeft, onSwipeRight, onSwipeUp, enabled]);
};


export const TherapistFinderPage: React.FC = () => {
  const { isAuthenticated, user, token, promptLogin } = useAuth(); 
  const { t, direction } = useTranslation();
  usePageTitle('therapistFinderTitle');
  const navigate = useNavigate();

  const [allTherapistsStorage, setAllTherapistsStorage] = useState<Therapist[]>([]); 
  const [displayedTherapists, setDisplayedTherapists] = useState<Therapist[]>([]); 
  const [totalTherapistsCount, setTotalTherapistsCount] = useState(0); 
  const [apiLoading, setApiLoading] = useState(true); 
  const [apiError, setApiError] = useState<string | null>(null);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedTherapistForModal, setSelectedTherapistForModal] = useState<Therapist | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [swipeAnimation, setSwipeAnimation] = useState<'left' | 'right' | 'up' | 'enter' | null>('enter');

  const [viewMode, setViewMode] = useState<ViewMode>('swipe');
  const [prevViewMode, setPrevViewMode] = useState<ViewMode>('swipe');
  const [animateView, setAnimateView] = useState(false);

  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const [activeFilters, setActiveFilters] = useState<Filters>({
    searchTerm: '',
    specializations: [],
    languages: [],
    minRating: 0,
    availability: [],
    locationSearch: '',
    showOnlyLiked: false,
  });
  const [gridCurrentPage, setGridCurrentPage] = useState(1);

  const mainContentAreaPaddingBottom = useMemo(() => {
    if (viewMode === 'swipe') {
      return `${BOTTOM_NAV_HEIGHT_PX + ACTION_BUTTONS_SWIPE_AREA_HEIGHT_PX}px`;
    }
    return `${BOTTOM_NAV_HEIGHT_PX}px`;
  }, [viewMode]);


  const availableSpecializations = useMemo(() => SPECIALIZATIONS_LIST.sort(), []);
  const availableLanguages = useMemo(() => LANGUAGES_LIST.sort(), []);
  const availableAvailabilities = useMemo(() => AVAILABILITY_OPTIONS, []);

  const fetchTherapists = useCallback(async (filters: Filters, page: number = 1, limit: number = ITEMS_PER_PAGE_GRID) => {
    setApiLoading(true);
    setApiError(null);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
        controller.abort();
        setApiError(t('apiTimeoutError')); // Use translated message
    }, API_TIMEOUT_MS);

    try {
        const queryParams = new URLSearchParams({
            page: String(page),
            limit: String(viewMode === 'swipe' ? 100 : limit), // Fetch more for swipe mode initially
        });
        if (filters.searchTerm) queryParams.append('searchTerm', filters.searchTerm);
        if (filters.specializations.length > 0) queryParams.append('specializations', filters.specializations.join(','));
        if (filters.languages.length > 0) queryParams.append('languages', filters.languages.join(','));
        if (filters.minRating > 0) queryParams.append('minRating', String(filters.minRating));
        if (filters.availability.length > 0) queryParams.append('availability', filters.availability.join(','));
        if (filters.locationSearch) queryParams.append('locationSearch', filters.locationSearch);
        // Note: showOnlyLiked will be handled client-side after fetching favorites or passed as a param if backend supports it

        // TODO: Implement actual API call
        const response = await fetch(`${API_BASE_URL}/therapists.php?${queryParams.toString()}`, {
            signal: controller.signal,
            headers: token ? { 'Authorization': `Bearer ${token}` } : {}
        });
        clearTimeout(timeoutId);

        if (!response.ok) {
            throw new Error(t('unknownApiError')); // Use translated message
        }
        const data = await response.json();

        if (data.status === 'success') {
            setAllTherapistsStorage(data.therapists || []); // Store all fetched (potentially for caching if filters change slightly)
            
            let finalFiltered = data.therapists || [];
            if (isAuthenticated && filters.showOnlyLiked && favorites.size > 0) {
                finalFiltered = finalFiltered.filter((therapist: Therapist) => favorites.has(therapist.id));
            }
            
            setDisplayedTherapists(finalFiltered);
            setTotalTherapistsCount(data.pagination?.totalItems || finalFiltered.length);
            setCurrentIndex(0);
            setSwipeAnimation(finalFiltered.length > 0 ? 'enter' : null);
        } else {
            throw new Error(data.message || t('unknownApiError'));
        }
    } catch (error: any) {
        clearTimeout(timeoutId);
        if (error.name !== 'AbortError') { // Don't override timeout error
            setApiError(error.message || t('unknownApiError'));
        }
        setDisplayedTherapists([]);
        setTotalTherapistsCount(0);
    } finally {
        setApiLoading(false);
    }
  }, [token, viewMode, isAuthenticated, favorites, t]); // Added t to dependencies

  const fetchFavorites = useCallback(async () => {
    if (!isAuthenticated || !token) {
        setFavorites(new Set()); // Clear favorites if not authenticated
        return;
    }
    try {
        const response = await fetch(`${API_BASE_URL}/client_favorites.php`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) {
            throw new Error(`Server responded with status: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.status === 'success' && Array.isArray(data.data)) {
            setFavorites(new Set(data.data));
        } else {
            console.error("Failed to fetch favorites:", data.message);
            setFavorites(new Set());
        }
    } catch (error) {
        console.error("Error fetching favorites:", error);
        setFavorites(new Set());
    }
  }, [isAuthenticated, token]);

  useEffect(() => {
    fetchFavorites();
  }, [fetchFavorites]);
  
  useEffect(() => {
    fetchTherapists(activeFilters, gridCurrentPage);
  }, [activeFilters, gridCurrentPage, fetchTherapists, favorites]); // Add favorites here to refilter when they change


  const numActiveFilters = useMemo(() => {
    let count = 0;
    if (activeFilters.searchTerm) count++;
    if (activeFilters.specializations.length > 0) count++;
    if (activeFilters.languages.length > 0) count++;
    if (activeFilters.minRating > 0) count++;
    if (activeFilters.availability.length > 0) count++;
    if (activeFilters.locationSearch) count++;
    if (activeFilters.showOnlyLiked && isAuthenticated) count++;
    return count;
  }, [activeFilters, isAuthenticated]);


  const handleViewModeChange = (newMode: ViewMode) => {
    if (newMode !== viewMode) {
        setPrevViewMode(viewMode);
        setViewMode(newMode);
        setAnimateView(true);
        setTimeout(() => setAnimateView(false), 300);
        if (newMode === 'grid') fetchTherapists(activeFilters, 1, ITEMS_PER_PAGE_GRID); // Reset to page 1 for grid
    }
  };


  const currentTherapistForSwipe = useMemo(() => {
    if (displayedTherapists.length === 0) return null;
    return displayedTherapists[currentIndex % displayedTherapists.length];
  }, [displayedTherapists, currentIndex]);

  const handleSwipe = (directionSwipe: 'left' | 'right' | 'up') => {
    if (!currentTherapistForSwipe) return;
    setSwipeAnimation(directionSwipe);

    setTimeout(() => {
        if (directionSwipe === 'up') {
            handleViewProfile(currentTherapistForSwipe);
        } else {
            setCurrentIndex((prev) => prev + 1);
        }
        setSwipeAnimation('enter');
    }, 300);
  };

  useSwipeKeyboardControls(
    () => handleSwipe(direction === 'rtl' ? 'right' : 'left'),
    () => handleSwipe(direction === 'rtl' ? 'left' : 'right'),
    () => handleSwipe('up'),
    viewMode === 'swipe' && !isDetailModalOpen && !isFilterModalOpen
  );


  const toggleFavorite = useCallback(async (therapistId: string) => {
    if (!isAuthenticated || user?.role !== UserRole.CLIENT || !token) {
      const therapistToLike = allTherapistsStorage.find(t => t.id === therapistId);
      promptLogin(t('like') + ` ${therapistToLike?.name || 'therapist'}`);
      return;
    }
    
    // TODO: Implement actual API call
    const isCurrentlyFavorite = favorites.has(therapistId);
    // Optimistic UI update
    setFavorites(prevFavorites => {
        const newFavorites = new Set(prevFavorites);
        if (isCurrentlyFavorite) newFavorites.delete(therapistId);
        else newFavorites.add(therapistId);
        return newFavorites;
    });

    try {
        const response = await fetch(`${API_BASE_URL}/client_favorites.php`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ therapistId })
        });
        
        if (!response.ok) {
            throw new Error(`Server responded with status: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.status !== 'success') {
            // Revert optimistic update on failure
            setFavorites(prevFavorites => {
                const newFavorites = new Set(prevFavorites);
                if (data.action === 'removed' && !isCurrentlyFavorite) newFavorites.delete(therapistId); // if API said removed but it was added
                if (data.action === 'added' && isCurrentlyFavorite) newFavorites.add(therapistId); // if API said added but it was removed
                return newFavorites;
            });
            console.error("Failed to toggle favorite:", data.message);
        } else {
             // If showOnlyLiked filter is active, refetch might be needed or client-side filter
            if (activeFilters.showOnlyLiked) {
                fetchTherapists(activeFilters, gridCurrentPage);
            }
        }
    } catch (error) {
        // Revert optimistic update on error
        setFavorites(prevFavorites => {
            const newFavorites = new Set(prevFavorites);
            if (isCurrentlyFavorite) newFavorites.add(therapistId); // it was removed, add it back
            else newFavorites.delete(therapistId); // it was added, remove it
            return newFavorites;
        });
        console.error("Error toggling favorite:", error);
    }

  }, [isAuthenticated, user, token, promptLogin, t, favorites, allTherapistsStorage, activeFilters, gridCurrentPage, fetchTherapists]);

  const handleConnect = (therapist: Therapist) => {
    if (!isAuthenticated) {
      promptLogin(t('connectOnWhatsApp') + ` ${therapist.name}`);
      return;
    }
    const cleanWhatsAppNumber = therapist.whatsappNumber.replace(/\D/g, '');
    const whatsappMessage = encodeURIComponent(t('whatsappGreeting', { name: therapist.name.split(' ').pop() || '', appName: t('appName') }) || `Hello Dr. ${therapist.name.split(' ').pop()}, I found you on ${t('appName')}.`);
    window.open(`https://wa.me/${cleanWhatsAppNumber}?text=${whatsappMessage}`, '_blank');
  };

  const handleViewProfile = (therapist: Therapist) => {
    setSelectedTherapistForModal(therapist);
    setIsDetailModalOpen(true);
  };

  const handleCloseDetailModal = () => {
    setIsDetailModalOpen(false);
    setTimeout(() => setSelectedTherapistForModal(null), 300);
  };

  const applyFilters = (newFilters: Filters) => {
    setActiveFilters(newFilters);
    setGridCurrentPage(1); // Reset to first page on filter change
    setIsFilterModalOpen(false);
    // fetchTherapists will be called by useEffect due to activeFilters change
  };

  const totalGridPages = Math.ceil(totalTherapistsCount / ITEMS_PER_PAGE_GRID);


  const NoResultsFound = () => (
      <div className="flex flex-col flex-grow items-center justify-center text-center p-8 h-full">
        <InformationCircleIcon className="w-16 h-16 text-accent/50 mb-4"/>
        <h2 className="text-2xl font-semibold text-textOnLight mb-2">{t('noResultsFound')}</h2>
        <p className="text-textOnLight/70 max-w-md">
          {apiError && apiError !== t('apiTimeoutError') ? apiError : t('noResultsMessage')} 
        </p>
      </div>
  );
  
  const getCardAnimationClass = () => {
    if (!currentTherapistForSwipe) return '';
    if (swipeAnimation === 'left') return 'animate-swipe-left';
    if (swipeAnimation === 'right') return 'animate-swipe-right';
    if (swipeAnimation === 'up') return 'animate-swipe-up';
    if (swipeAnimation === 'enter') return 'animate-card-enter';
    return '';
  };
  
  const fixedCardContainerStyle: React.CSSProperties = useMemo(() => ({
    position: 'fixed',
    top: `${NAVBAR_HEIGHT_PX}px`, 
    left: `0px`, 
    right: `0px`, 
    bottom: `${BOTTOM_NAV_HEIGHT_PX + ACTION_BUTTONS_SWIPE_AREA_HEIGHT_PX}px`, 
    zIndex: 30, 
  }), []);


  const renderSwipeViewCardArea = () => {
    if (apiLoading && !currentTherapistForSwipe && displayedTherapists.length === 0) {
        return <div className="flex-grow flex items-center justify-center"><div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-accent"></div></div>;
    }
    if (!currentTherapistForSwipe) {
         return <div className="flex-grow flex items-center justify-center"><NoResultsFound /></div>;
    }

    return (
        <div 
          style={fixedCardContainerStyle}
          className={`border border-gray-300 rounded-lg shadow-lg overflow-hidden flex items-center justify-center bg-background ${animateView ? 'animate-slide-up-fade-in' : ''}`}
        >
            <div
              key={currentTherapistForSwipe.id + currentIndex} 
              className={`w-full h-full ${getCardAnimationClass()}`}
            >
                <SwipableTherapistCard
                    therapist={currentTherapistForSwipe}
                    onViewProfile={() => handleSwipe('up')}
                />
            </div>
        </div>
    );
  };

  const renderGridView = () => {
    if (apiLoading && displayedTherapists.length === 0) return <div className="w-full h-full flex items-center justify-center"><div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-accent"></div></div>;
    if (displayedTherapists.length === 0) return <div className={`w-full h-full flex items-center justify-center ${animateView ? 'animate-slide-up-fade-in' : ''}`}><NoResultsFound /></div>;

    // Pagination for grid view is now handled by API
    const paginatedForGrid = displayedTherapists;


    return (
        <div className={`w-full max-w-6xl mx-auto h-full ${animateView ? 'animate-slide-up-fade-in' : ''}`}>
             <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8 pb-8">
                {paginatedForGrid.map(therapist => (
                <TherapistCard
                    key={therapist.id}
                    therapist={therapist}
                    onViewProfile={handleViewProfile}
                    onToggleFavorite={toggleFavorite}
                    isFavorite={favorites.has(therapist.id)}
                />
                ))}
            </div>
            {totalGridPages > 1 && (
            <div className="flex justify-center items-center mt-2 mb-6 space-x-2">
              <Button
                onClick={() => setGridCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={gridCurrentPage === 1}
                variant="light" size="md" leftIcon={direction === 'rtl' ? <ChevronRightIcon /> :<ChevronLeftIcon/>}
                className="active:scale-95"
              > {t('prev')} </Button>
              <span className="text-sm text-textOnLight/80">
                Page {gridCurrentPage} of {totalGridPages}
              </span>
              <Button
                onClick={() => setGridCurrentPage(prev => Math.min(totalGridPages, prev + 1))}
                disabled={gridCurrentPage === totalGridPages}
                variant="light" size="md" rightIcon={direction === 'rtl' ? <ChevronLeftIcon /> :<ChevronRightIcon />}
                className="active:scale-95"
              > {t('next')} </Button>
            </div>
          )}
        </div>
    );
  };

  const renderMapView = () => {
    if (apiLoading && displayedTherapists.length === 0) return <div className="w-full h-full flex items-center justify-center"><div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-accent"></div></div>;
    if (displayedTherapists.length === 0) return <div className={`w-full h-full flex items-center justify-center ${animateView ? 'animate-slide-up-fade-in' : ''}`}><NoResultsFound /></div>;

    return (
        <div className={`w-full h-full ${animateView ? 'animate-slide-up-fade-in' : ''}`}>
            <TherapistMapView therapists={displayedTherapists} onViewProfile={handleViewProfile} />
        </div>
    );
  };

  if (apiLoading && allTherapistsStorage.length === 0 && !apiError) {
    return (
      <div className="flex flex-col flex-grow items-center justify-center text-center p-8 bg-background" style={{paddingBottom: mainContentAreaPaddingBottom}}>
        <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-accent" title={t('loading')}/>
        <p className="mt-4 text-textOnLight">{t('loading')}...</p>
      </div>
    );
  }

  if (apiError && allTherapistsStorage.length === 0) {
    return (
      <div className="flex flex-col flex-grow items-center justify-center text-center p-8 bg-background" style={{paddingBottom: mainContentAreaPaddingBottom}}>
        <InformationCircleIcon className="w-24 h-24 text-red-400 mb-6"/>
        <h2 className="text-3xl font-semibold text-textOnLight mb-3">{t('errorLoadingTherapists', {default: 'Error Loading Therapists'})}</h2>
        <p className="text-textOnLight/70 max-w-md">{apiError}</p>
      </div>
    );
  }

  const noFiltersApplied = !Object.values(activeFilters).some(v => Array.isArray(v) ? v.length > 0 : !!v);
  if (!apiLoading && allTherapistsStorage.length === 0 && noFiltersApplied && !apiError) {
    const messageKey = user?.role === UserRole.ADMIN ? 'noTherapistsAdminMessage' : 'noTherapistsMessage';
    return (
      <div className="flex flex-col flex-grow items-center justify-center text-center p-8 bg-background" style={{paddingBottom: mainContentAreaPaddingBottom}}>
        <InformationCircleIcon className="w-24 h-24 text-accent/50 mb-6"/>
        <h2 className="text-3xl font-semibold text-textOnLight mb-3">{t('noTherapistsAvailable')}</h2>
        <p className="text-textOnLight/70 max-w-md">{t(messageKey)}</p>
        {user?.role === UserRole.ADMIN && <Button variant="primary" className="mt-6" onClick={() => navigate('/dashboard/admin')}>{t('goToAdminPanel')}</Button>}
      </div>
    );
  }

  const filterButtonActive = isFilterModalOpen || numActiveFilters > 0;
  const navButtonBaseClasses = "!px-1.5 !py-1 capitalize flex flex-col items-center h-full justify-center rounded-lg flex-1";

  return (
    <div className="flex flex-col flex-grow bg-background overflow-hidden" style={{paddingBottom: mainContentAreaPaddingBottom}}>
       <style>{`
        @keyframes swipe-left { from { transform: translateX(0) rotate(0) scale(1); opacity: 1; } to { transform: translateX(${direction === 'rtl' ? '120%' : '-120%'}) rotate(${direction === 'rtl' ? '10deg' : '-10deg'}) scale(0.9); opacity: 0; } }
        .animate-swipe-left { animation: swipe-left 0.3s ease-out forwards; }
        @keyframes swipe-right { from { transform: translateX(0) rotate(0) scale(1); opacity: 1; } to { transform: translateX(${direction === 'rtl' ? '-120%' : '120%'}) rotate(${direction === 'rtl' ? '-10deg' : '10deg'}) scale(0.9); opacity: 0; } }
        .animate-swipe-right { animation: swipe-right 0.3s ease-out forwards; }
        @keyframes swipe-up { from { transform: translateY(0) scale(1); opacity: 1; } to { transform: translateY(-100%) scale(0.85); opacity: 0; } }
        .animate-swipe-up { animation: swipe-up 0.3s ease-out forwards; }
        @keyframes card-enter { from { transform: scale(0.95) translateY(10px); opacity: 0; } to { transform: scale(1) translateY(0); opacity: 1; } }
        .animate-card-enter { animation: card-enter 0.3s ease-out forwards; }
      `}</style>

      <div className={`w-full flex-grow flex flex-col relative overflow-hidden ${
          viewMode === 'swipe' ? '' : 
          viewMode === 'grid' ? 'px-4 pt-1 overflow-y-auto' : 
          viewMode === 'map' ? 'p-0' : ''
      }`}>
        {viewMode === 'swipe' && renderSwipeViewCardArea()}
        {viewMode === 'grid' && renderGridView()}
        {viewMode === 'map' && (
          <div className="absolute top-0 left-0 right-0 bottom-0 flex flex-col">
            {renderMapView()}
          </div>
        )}
      </div>

      {viewMode === 'swipe' && currentTherapistForSwipe && (
        <div 
            className="fixed left-0 right-0 bg-primary shadow-md px-3 flex flex-col items-center justify-center"
            style={{ 
                bottom: `${BOTTOM_NAV_HEIGHT_PX}px`, 
                height: `${ACTION_BUTTONS_SWIPE_AREA_HEIGHT_PX}px`, 
                zIndex: 950 
            }}
        >
            <div className="flex items-center justify-evenly w-full max-w-xs sm:max-w-sm mx-auto">
                <Button
                    variant="light" size="lg" onClick={() => handleSwipe(direction === 'rtl' ? 'right' : 'left')}
                    className="!p-3 sm:!p-4 rounded-full shadow-lg !text-textOnLight hover:!bg-gray-200 active:scale-95"
                    aria-label={t('skip')} title={`${t('skip')} (${direction === 'rtl' ? 'ArrowRight' : 'ArrowLeft'})`}
                ><XIcon className="w-5 h-5 sm:w-6 sm:h-6 text-red-500" /></Button>

                <Button
                    variant="primary" size="lg" onClick={() => handleConnect(currentTherapistForSwipe)}
                    className="!p-3 sm:!p-4 rounded-full shadow-lg !bg-green-500 hover:!bg-green-600 !text-white active:scale-95"
                    aria-label={t('connectOnWhatsApp')} title={t('connectOnWhatsApp')}
                ><WhatsAppIcon className="w-5 h-5 sm:w-7 sm:h-7" /></Button>

                <Button
                    variant="light" size="lg" onClick={() => toggleFavorite(currentTherapistForSwipe.id)}
                    className={`!p-3 sm:!p-4 rounded-full shadow-lg hover:!bg-red-50 active:scale-95 ${favorites.has(currentTherapistForSwipe.id) ? '!text-red-500' : '!text-textOnLight hover:!text-red-400'}`}
                    aria-label={favorites.has(currentTherapistForSwipe.id) ? t('unlike') : t('like')}
                    title={favorites.has(currentTherapistForSwipe.id) ? t('unlike') : t('like')}
                ><HeartIcon filled={favorites.has(currentTherapistForSwipe.id)} className="w-5 h-5 sm:w-7 sm:h-7" /></Button>

                <Button
                    variant="light" size="lg" onClick={() => handleSwipe(direction === 'rtl' ? 'left' : 'right')}
                    className="!p-3 sm:!p-4 rounded-full shadow-lg !text-textOnLight hover:!bg-gray-200 active:scale-95"
                    aria-label={t('next')} title={`${t('next')} (${direction === 'rtl' ? 'ArrowLeft' : 'ArrowRight'})`}
                ><ChevronRightIcon className={`w-5 h-5 sm:w-7 sm:h-7 text-accent ${direction === 'rtl' ? 'transform scale-x-[-1]' : ''}`} /></Button>
            </div>
            <p className="text-[10px] sm:text-xs text-textOnLight/60 text-center mt-1">{t('useArrowKeysForDetails')}</p>
        </div>
      )}

      <nav
        className="fixed bottom-0 left-0 right-0 bg-primary border-t border-accent/20 shadow-top-lg z-[1000] flex justify-around items-center"
        style={{height: `${BOTTOM_NAV_HEIGHT_PX}px`}}
        role="navigation"
        aria-label={t('mainNavigation', { default: 'Main Navigation' })}
      >
          <Button
              key="filters"
              onClick={() => setIsFilterModalOpen(true)}
              variant={filterButtonActive ? 'primary' : 'ghost'}
              size="sm" 
              className={`${navButtonBaseClasses} relative 
                         ${filterButtonActive ? 'shadow-[0_0_10px_rgba(4,83,88,0.35)] scale-105' : 'text-textOnLight/70 hover:!text-accent hover:scale-105'}`}
              aria-label={numActiveFilters > 0 ? t('filterActiveAction', { count: numActiveFilters }) : t('filterAction')}
              aria-pressed={isFilterModalOpen}
          >
              {numActiveFilters > 0 ? <FilterSolidIcon className="w-6 h-6" /> : <AdjustmentsHorizontalIcon className="w-6 h-6" />}
              {numActiveFilters > 0 && (
                <span className="absolute top-1 right-1 sm:top-1.5 sm:right-1.5 bg-red-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center border-2 border-background">
                    {numActiveFilters}
                </span>
              )}
          </Button>

          <Button
              key="swipe"
              onClick={() => handleViewModeChange('swipe')}
              variant={viewMode === 'swipe' ? 'primary' : 'ghost'}
              size="sm"
              className={`${navButtonBaseClasses} 
                         ${viewMode === 'swipe' ? 'shadow-[0_0_10px_rgba(4,83,88,0.35)] scale-105' : 'text-textOnLight/70 hover:!text-accent hover:scale-105'}`}
              aria-label={t('viewModeSwipe')}
              aria-pressed={viewMode === 'swipe'}
          >
              <span className="text-sm">{t('viewModeSwipe')}</span>
          </Button>

          <Button
              key="grid"
              onClick={() => handleViewModeChange('grid')}
              variant={viewMode === 'grid' ? 'primary' : 'ghost'}
              size="sm"
              className={`${navButtonBaseClasses} 
                         ${viewMode === 'grid' ? 'shadow-[0_0_10px_rgba(4,83,88,0.35)] scale-105' : 'text-textOnLight/70 hover:!text-accent hover:scale-105'}`}
              aria-label={t('viewModeGrid')}
              aria-pressed={viewMode === 'grid'}
          >
              <span className="text-sm">{t('viewModeGrid')}</span>
          </Button>

          <Button
              key="map"
              onClick={() => handleViewModeChange('map')}
              variant={viewMode === 'map' ? 'primary' : 'ghost'}
              size="sm"
              className={`${navButtonBaseClasses} 
                         ${viewMode === 'map' ? 'shadow-[0_0_10px_rgba(4,83,88,0.35)] scale-105' : 'text-textOnLight/70 hover:!text-accent hover:scale-105'}`}
              aria-label={t('viewModeMap')}
              aria-pressed={viewMode === 'map'}
          >
              <span className="text-sm">{t('viewModeMap')}</span>
          </Button>
      </nav>


      {selectedTherapistForModal && (
        <TherapistDetailModal
          therapist={selectedTherapistForModal}
          isOpen={isDetailModalOpen}
          onClose={handleCloseDetailModal}
          onToggleFavorite={toggleFavorite}
          isFavorite={selectedTherapistForModal ? favorites.has(selectedTherapistForModal.id) : false}
        />
      )}

      <FilterModalComponent
        isOpen={isFilterModalOpen}
        onClose={() => setIsFilterModalOpen(false)}
        currentFilters={activeFilters}
        onApplyFilters={applyFilters}
        availableSpecializations={availableSpecializations}
        availableLanguages={availableLanguages}
        availableAvailabilities={availableAvailabilities}
        t={t}
      />
    </div>
  );
};


interface FilterModalProps {
    isOpen: boolean;
    onClose: () => void;
    currentFilters: Filters;
    onApplyFilters: (filters: Filters) => void;
    availableSpecializations: string[];
    availableLanguages: string[];
    availableAvailabilities: string[];
    t: (key: string, replacements?: Record<string, string | number>) => string;
}

const FilterModalComponent: React.FC<FilterModalProps> = ({
    isOpen,
    onClose,
    currentFilters,
    onApplyFilters,
    availableSpecializations,
    availableLanguages,
    availableAvailabilities,
    t
}) => {
    const { isAuthenticated, user, promptLogin } = useAuth();
    const [tempFilters, setTempFilters] = useState<Filters>(currentFilters);

    useEffect(() => {
        if (isOpen) {
            setTempFilters(currentFilters);
        }
    }, [currentFilters, isOpen]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value, type } = e.target;
        const inputElement = e.target as HTMLInputElement;

        if (type === 'checkbox') {
            const isArrayCheckbox = name.includes('.');
            if (isArrayCheckbox) {
                const [key, val] = name.split('.');
                setTempFilters(prev => ({
                    ...prev,
                    [key]: inputElement.checked
                        ? [...((prev[key as keyof Filters] || []) as string[]), val]
                        : ((prev[key as keyof Filters] || []) as string[]).filter(item => item !== val)
                }));
            } else {
                setTempFilters(prev => ({
                    ...prev,
                    [name]: inputElement.checked
                }));
            }
        } else {
            setTempFilters(prev => ({ ...prev, [name]: type === 'number' ? parseFloat(value) : value }));
        }
    };

    const handleSubmit = () => {
        onApplyFilters(tempFilters);
    };

    const handleReset = () => {
        const resetFilters: Filters = {
            searchTerm: '',
            specializations: [],
            languages: [],
            minRating: 0,
            availability: [],
            locationSearch: '',
            showOnlyLiked: false,
        };
        setTempFilters(resetFilters);
    }

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={t('filterTherapists')} size="lg">
            <div className="space-y-6">
                <fieldset className="border border-gray-300 p-4 rounded-md">
                    <legend className="text-sm font-medium text-gray-700 px-2">{t('searchCriteria', {default: "Search Criteria"})}</legend>
                    <InputField
                        label={t('searchByName')}
                        id="searchTerm"
                        name="searchTerm"
                        value={tempFilters.searchTerm}
                        onChange={handleInputChange}
                        placeholder={t('searchByNamePlaceholder', {default: "e.g., Dr. Evelyn"})}
                        containerClassName="mb-3"
                    />
                    <InputField
                        label={t('searchByLocationAddress')}
                        id="locationSearch"
                        name="locationSearch"
                        value={tempFilters.locationSearch || ''}
                        onChange={handleInputChange}
                        placeholder={t('searchByLocationPlaceholder', {default: "e.g., Wellness Ave, Mindful City"})}
                        containerClassName="mb-0"
                    />
                </fieldset>

                <fieldset className="border border-gray-300 p-4 rounded-md">
                    <legend className="text-sm font-medium text-gray-700 px-2">{t('refineByDetails', {default: "Refine by Details"})}</legend>
                    <div className="mb-3">
                        <label className="block text-sm font-medium text-gray-700 mb-1">{t('specializations')}</label>
                        <div className="max-h-32 sm:max-h-40 overflow-y-auto border border-gray-200 rounded-md p-3 space-y-2 bg-gray-50">
                            {availableSpecializations.map(spec => (
                                <CheckboxField
                                    key={spec}
                                    id={`spec-${spec}`}
                                    name={`specializations.${spec}`}
                                    label={spec}
                                    checked={(tempFilters.specializations || []).includes(spec)}
                                    onChange={handleInputChange}
                                    className="h-4 w-4 text-accent border-gray-300 rounded focus:ring-accent"
                                    containerClassName="!mb-0"
                                />
                            ))}
                        </div>
                         <p className="text-xs text-gray-500 mt-1.5">{t('selectOneOrMoreSpecializations')}</p>
                    </div>
                     <div className="mb-3">
                        <label className="block text-sm font-medium text-gray-700 mb-1">{t('languages')}</label>
                        <div className="max-h-32 sm:max-h-40 overflow-y-auto border border-gray-200 rounded-md p-3 space-y-2 bg-gray-50">
                            {availableLanguages.map(lang => (
                                <CheckboxField
                                    key={lang}
                                    id={`lang-${lang}`}
                                    name={`languages.${lang}`}
                                    label={lang}
                                    checked={(tempFilters.languages || []).includes(lang)}
                                    onChange={handleInputChange}
                                    className="h-4 w-4 text-accent border-gray-300 rounded focus:ring-accent"
                                    containerClassName="!mb-0"
                                />
                            ))}
                        </div>
                        <p className="text-xs text-gray-500 mt-1.5">{t('selectOneOrMoreLanguages')}</p>
                    </div>
                </fieldset>

                <fieldset className="border border-gray-300 p-4 rounded-md">
                    <legend className="text-sm font-medium text-gray-700 px-2">{t('availabilityAndRating', { default: "Availability & Rating"})}</legend>
                     <div className="mb-3">
                        <label className="block text-sm font-medium text-gray-700 mb-1">{t('availability')}</label>
                        <div className="max-h-32 sm:max-h-40 overflow-y-auto border border-gray-200 rounded-md p-3 space-y-2 bg-gray-50">
                            {availableAvailabilities.map(avail => (
                                <CheckboxField
                                    key={avail}
                                    id={`avail-${avail}`}
                                    name={`availability.${avail}`}
                                    label={t(avail.toLowerCase().replace(/\s+/g, ''), {default: avail})}
                                    checked={(tempFilters.availability || []).includes(avail)}
                                    onChange={handleInputChange}
                                    className="h-4 w-4 text-accent border-gray-300 rounded focus:ring-accent"
                                    containerClassName="!mb-0"
                                />
                            ))}
                        </div>
                        <p className="text-xs text-gray-500 mt-1.5">{t('selectAvailabilityHint')}</p>
                    </div>

                    <SelectField
                        label={t('minRating')}
                        id="minRating"
                        name="minRating"
                        value={String(tempFilters.minRating)}
                        onChange={handleInputChange}
                        options={[
                            { value: '0', label: t('anyRating') },
                            { value: '3', label: t('starsAndUp', {stars: 3}) },
                            { value: '4', label: t('starsAndUp', {stars: 4}) },
                            { value: '4.5', label: t('starsAndUp', {stars: 4.5}) },
                        ]}
                        containerClassName="mb-0"
                    />
                </fieldset>

                <fieldset className="border border-gray-300 p-4 rounded-md">
                    <legend className="text-sm font-medium text-gray-700 px-2">{t('personalFiltersLabel')}</legend>
                    {(isAuthenticated && user?.role === UserRole.CLIENT) ? (
                        <CheckboxField
                            label={t('filterShowOnlyLikedLabel')}
                            id="showOnlyLiked"
                            name="showOnlyLiked"
                            checked={tempFilters.showOnlyLiked || false}
                            onChange={handleInputChange}
                            description={t('filterShowOnlyLikedDescription')}
                            containerClassName="!mb-0"
                        />
                    ) : (
                        <div className="text-center py-2">
                            <p className="text-sm text-gray-600">{t('loginToUsePersonalFilters', {action: t('usePersonalFilters', {default: "use personal filters"})})}</p>
                            <Button
                                variant="link"
                                onClick={() => {
                                    onClose();
                                    promptLogin(t('usePersonalFilters', {default: "use personal filters"}));
                                }}
                                className="mt-1.5 !text-sm !text-accent hover:!underline"
                            >
                                {t('loginNowPrompt')}
                            </Button>
                        </div>
                    )}
                </fieldset>

                <div className="flex flex-col sm:flex-row justify-end space-y-2 sm:space-y-0 sm:space-x-3 pt-5 border-t border-gray-200">
                    <Button variant="light" onClick={handleReset} className="w-full sm:w-auto">{t('resetFilters')}</Button>
                    <Button variant="primary" onClick={handleSubmit} className="w-full sm:w-auto">{t('applyFilters')}</Button>
                </div>
            </div>
        </Modal>
    );
};