import React, { useState, useEffect, FormEvent, useCallback } from 'react';
import { Outlet, Route, Routes, Navigate, useOutletContext, Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from '../../hooks/useTranslation';
import { usePageTitle } from '../../hooks/usePageTitle';
import { Clinic, UserRole, ClinicSpaceListing, MembershipStatus, UserManagementInfo, MembershipHistoryItem } from '../../types';
import { 
    API_BASE_URL, 
    CLINIC_SPACE_PHOTO_MAX_SIZE_MB, 
    PAYMENT_RECEIPT_MAX_SIZE_MB, 
    PROFILE_PICTURE_MAX_SIZE_MB, 
    CLINIC_SPACE_FEATURES_LIST,
    CLINIC_MEMBERSHIP_FEE,
    STANDARD_MEMBERSHIP_TIER_NAME
} from '../../constants';
import { DashboardLayout } from '../../components/dashboard/shared/DashboardLayout';
import { Button } from '../../components/common/Button';
import { InputField, TextareaField, FileUploadField, SelectField, CheckboxField } from '../../components/dashboard/shared/FormElements';
import { Modal } from '../../components/common/Modal';
import { 
    BuildingOfficeIcon, BriefcaseIcon, ChartBarIcon, CogIcon, TagIcon, PhotoIcon, ClockIcon, UsersIcon, XIcon, 
    PlusCircleIcon, PencilIcon, TrashIcon, InformationCircleIcon, ArrowUpOnSquareIcon, CheckCircleIcon,
    ChevronDownIcon, ChevronUpIcon
} from '../../components/icons';


interface OutletContextType {
  clinicData: Clinic | null;
  clinicOwnerUser: UserManagementInfo | null;
  clinicSpaceListings: ClinicSpaceListing[];
  handleClinicProfileSave: (updatedProfile: Partial<Clinic>, profilePicFile?: File | null) => Promise<void>; 
  handleMembershipApplication: (receiptFile: File | null) => Promise<void>; 
  handleAddOrUpdateSpaceListing: (listing: ClinicSpaceListing, photoFiles: (File | null)[]) => Promise<void>; 
  handleDeleteSpaceListing: (listingId: string) => Promise<void>; 
  handleOwnerUserSave: (updatedUser: Partial<UserManagementInfo>) => Promise<void>; 
  isLoading: boolean;
  membershipHistory: MembershipHistoryItem[]; // Added for settings tab
  analyticsData: any; // Placeholder for analytics data
}


// --- Accordion Section Component ---
interface AccordionSectionProps {
    titleKey: string;
    icon?: React.ReactElement<{ className?: string }>;
    isOpen: boolean;
    onClick: () => void;
    children: React.ReactNode;
    badgeText?: string;
    badgeColor?: string;
}
const AccordionSection: React.FC<AccordionSectionProps> = ({ titleKey, icon, isOpen, onClick, children, badgeText, badgeColor }) => {
    const { t, direction } = useTranslation();
    return (
        <div className="border border-gray-200 rounded-lg overflow-hidden">
            <button
                type="button"
                className={`w-full flex items-center justify-between p-4 text-left font-medium text-textOnLight hover:bg-gray-50/50 focus:outline-none ${isOpen ? 'bg-gray-50/50 border-b border-gray-200' : ''}`}
                onClick={onClick}
                aria-expanded={isOpen}
                aria-controls={`accordion-content-${titleKey}`}
            >
                <span className="flex items-center">
                    {icon && React.cloneElement(icon, { className: `w-5 h-5 ${direction === 'rtl' ? 'ml-2' : 'mr-2'} text-accent`})}
                    {t(titleKey)}
                    {badgeText && (
                        <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${badgeColor || 'bg-gray-100 text-gray-800'} ${direction === 'rtl' ? 'mr-2' : 'ml-2'}`}>
                            {badgeText}
                        </span>
                    )}
                </span>
                {isOpen ? <ChevronUpIcon className="w-5 h-5 text-gray-500" /> : <ChevronDownIcon className="w-5 h-5 text-gray-500" />}
            </button>
            {isOpen && (
                <div id={`accordion-content-${titleKey}`} className="p-4 bg-white">
                    {children}
                </div>
            )}
        </div>
    );
};


// --- Main Clinic Profile Tab ---
const ClinicProfileTabContent: React.FC = () => {
    const { t, direction } = useTranslation();
    usePageTitle('dashboardClinicProfileTab');
    const { clinicData, handleClinicProfileSave, isLoading } = useOutletContext<OutletContextType>();
    
    const [profileData, setProfileData] = useState<Partial<Clinic>>(clinicData || {});
    const [profilePictureFile, setProfilePictureFile] = useState<File | null>(null);
    
    useEffect(() => {
        setProfileData(clinicData || {});
        setProfilePictureFile(null);
    }, [clinicData]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        setProfileData(prev => ({ ...prev, [e.target.name]: e.target.value }));
    };
    
    const handleProfileSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        await handleClinicProfileSave(profileData, profilePictureFile);
    };
    
    if (isLoading && !clinicData) return <div className="p-6 text-center"><p className="text-textOnLight">{t('loading')}</p></div>;

    return (
        <div className="space-y-2">
            <form onSubmit={handleProfileSubmit} className="bg-primary p-6 rounded-lg shadow space-y-6 text-textOnLight">
                <h3 className="text-xl font-semibold mb-4 flex items-center text-accent"><BuildingOfficeIcon className={`w-6 h-6 ${direction === 'rtl' ? 'ms-2' : 'me-2'}`}/>{t('clinicBusinessProfileTitle')}</h3>
                 <FileUploadField 
                    label={t('clinicProfilePictureLabel')} 
                    id="clinicProfilePictureUrl"
                    currentFileUrl={profileData.profilePictureUrl}
                    onFileChange={setProfilePictureFile} 
                    maxSizeMB={PROFILE_PICTURE_MAX_SIZE_MB} 
                    description={t('uploadProfilePictureDescription', {size: PROFILE_PICTURE_MAX_SIZE_MB})}
                />
                <InputField label={t('clinicBusinessName')} id="name" name="name" value={profileData.name || ''} onChange={handleChange} required />
                <TextareaField label={t('clinicProfileDescription')} id="description" name="description" value={profileData.description || ''} onChange={handleChange} rows={4} required 
                    description={t('clinicDescriptionHelperText')}
                />
                <InputField label={t('clinicFullAddressLabel')} id="address" name="address" value={profileData.address || ''} onChange={handleChange} required />
                <InputField label={t('contactWhatsAppNumber')} id="whatsappNumber" name="whatsappNumber" type="tel" value={profileData.whatsappNumber || ''} onChange={handleChange} required placeholder="+1234567890"/>
                <TextareaField label={t('operatingHoursLabel')} id="operatingHours" name="operatingHours" 
                    value={profileData.operatingHours ? Object.entries(profileData.operatingHours).map(([day, hours]) => `${day}: ${hours}`).join('\n') : ''}
                    onChange={(e) => {
                        const lines = e.target.value.split('\n');
                        const newOperatingHours: Record<string, string> = {};
                        lines.forEach(line => {
                            const parts = line.split(':');
                            if (parts.length === 2) newOperatingHours[parts[0].trim()] = parts[1].trim();
                        });
                        setProfileData(prev => ({...prev, operatingHours: newOperatingHours }));
                    }}
                    rows={3} description={t('operatingHoursHelperText')}
                />
                <TextareaField label={t('generalAmenitiesLabel')} id="amenities" name="amenities" 
                    value={(profileData.amenities || []).join(', ')}
                    onChange={(e) => setProfileData(prev => ({...prev, amenities: e.target.value.split(',').map(a => a.trim()).filter(a => a) }))}
                    rows={2} description={t('generalAmenitiesHelperText')}
                />
                <div className="pt-4">
                    <Button type="submit" disabled={isLoading} leftIcon={<ArrowUpOnSquareIcon />}>{isLoading ? t('saving') : t('saveClinicProfileButton')}</Button>
                </div>
            </form>
        </div>
    );
};

// --- My Clinic Listings Tab ---
interface ClinicSpaceListingFormModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (listing: ClinicSpaceListing, photoFiles: (File | null)[]) => void;
    initialListing?: ClinicSpaceListing | null;
    isLoading: boolean;
}

const ClinicSpaceListingFormModal: React.FC<ClinicSpaceListingFormModalProps> = ({ isOpen, onClose, onSave, initialListing, isLoading }) => {
    const { t, direction } = useTranslation();
    const [listingData, setListingData] = useState<Partial<ClinicSpaceListing>>(initialListing || {});
    const [photoFiles, setPhotoFiles] = useState<(File | null)[]>([null, null, null]); 

    useEffect(() => {
        if (isOpen) {
            setListingData(initialListing || { photos: [], features: [] }); 
            setPhotoFiles([null, null, null]);
        }
    }, [isOpen, initialListing]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value, type } = e.target;
        if (name === "rentalPrice") {
            setListingData(prev => ({ ...prev, [name]: parseFloat(value) || 0 }));
        } else {
            setListingData(prev => ({ ...prev, [name]: value }));
        }
    };
    
    const handleFeaturesChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setListingData(prev => ({...prev, features: e.target.value.split(',').map(f => f.trim()).filter(f => f)}));
    };
    
    const handlePhotoFileChange = (index: number, file: File | null) => {
        const newPhotoFiles = [...photoFiles];
        newPhotoFiles[index] = file;
        setPhotoFiles(newPhotoFiles);
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const finalListingData: ClinicSpaceListing = {
            id: listingData.id || `space-${Date.now()}`, 
            name: listingData.name || t('unnamedSpace', { default: 'Unnamed Space'}),
            description: listingData.description || '',
            photos: listingData.photos || [], 
            rentalPrice: listingData.rentalPrice || 0,
            rentalDuration: listingData.rentalDuration || t('perHour', { default: 'per hour'}),
            rentalTerms: listingData.rentalTerms || '',
            features: listingData.features || []
        };
        onSave(finalListingData, photoFiles);
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={initialListing ? t('editClinicSpaceListingTitle') : t('addNewClinicSpaceListingTitle')} size="2xl">
            <form onSubmit={handleSubmit} className="space-y-6">
                <InputField label={t('clinicSpaceNameLabel')} id="name" name="name" value={listingData.name || ''} onChange={handleChange} required />
                <TextareaField label={t('clinicSpaceDescriptionLabel')} id="description" name="description" value={listingData.description || ''} onChange={handleChange} rows={3} required />
                
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{t('clinicSpacePhotosLabel')}</label>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        {[0, 1, 2].map(index => (
                            <FileUploadField
                                key={index}
                                label={`${t('photoLabel', { default: 'Photo' })} ${index + 1}`}
                                id={`spacePhoto${index}`}
                                currentFileUrl={listingData.photos?.[index]}
                                onFileChange={(file) => handlePhotoFileChange(index, file)}
                                maxSizeMB={CLINIC_SPACE_PHOTO_MAX_SIZE_MB}
                                accept="image/*"
                            />
                        ))}
                    </div>
                     <p className="mt-1 text-xs text-gray-500">{t('clinicSpacePhotosHelperText', {count: 3, size: CLINIC_SPACE_PHOTO_MAX_SIZE_MB})}</p>
                </div>

                <fieldset className="border border-gray-300 p-4 rounded-md">
                    <legend className="text-sm font-medium text-gray-700 px-2">{t('rentalInformationTitle')}</legend>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <InputField label={t('rentalPriceField')} id="rentalPrice" name="rentalPrice" type="number" value={String(listingData.rentalPrice || '')} onChange={handleChange} required />
                        <InputField label={t('rentalDurationField')} id="rentalDuration" name="rentalDuration" value={listingData.rentalDuration || ''} onChange={handleChange} placeholder={t('rentalDurationPlaceholder', { default: 'e.g., per hour, per day'})} required />
                    </div>
                    <TextareaField label={t('rentalTermsField')} id="rentalTerms" name="rentalTerms" value={listingData.rentalTerms || ''} onChange={handleChange} rows={2} 
                        description={t('rentalTermsHelperText')}
                    />
                </fieldset>
                
                <TextareaField 
                    label={t('featuresAndFacilitiesLabel')} 
                    id="features" 
                    name="features" 
                    value={(listingData.features || []).join(', ')} 
                    onChange={handleFeaturesChange} 
                    rows={3} 
                    description={t('featuresHelperText', {exampleFeatures: CLINIC_SPACE_FEATURES_LIST.slice(0,3).join(', ')})}
                />

                <div className="pt-5 flex justify-end space-x-3">
                    <Button type="button" variant="light" onClick={onClose}>{t('cancelButtonLabel')}</Button>
                    <Button type="submit" variant="primary" disabled={isLoading} leftIcon={<ArrowUpOnSquareIcon />}>
                        {isLoading ? t('saving') : (initialListing ? t('saveChangesButtonLabel') : t('addListingButtonLabel'))}
                    </Button>
                </div>
            </form>
        </Modal>
    );
};


const MyClinicListingsTabContent: React.FC = () => {
    const { t, direction } = useTranslation();
    usePageTitle('dashboardMyClinicsTab');
    const { clinicData, clinicSpaceListings, handleAddOrUpdateSpaceListing, handleDeleteSpaceListing, isLoading } = useOutletContext<OutletContextType>();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingListing, setEditingListing] = useState<ClinicSpaceListing | null>(null);

    const openAddModal = () => {
        setEditingListing(null);
        setIsModalOpen(true);
    };

    const openEditModal = (listing: ClinicSpaceListing) => {
        setEditingListing(listing);
        setIsModalOpen(true);
    };
    
    const handleSaveListing = async (listing: ClinicSpaceListing, photoFiles: (File | null)[]) => {
        await handleAddOrUpdateSpaceListing(listing, photoFiles);
        setIsModalOpen(false);
    };

    const handleDelete = async (listingId: string) => {
        await handleDeleteSpaceListing(listingId);
    }

    return (
        <div className="bg-primary p-6 rounded-lg shadow text-textOnLight">
            <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-semibold text-accent flex items-center"><BriefcaseIcon className={`w-6 h-6 ${direction === 'rtl' ? 'ms-2' : 'me-2'}`}/>{t('manageYourClinicSpacesTitle')}</h3>
                <Button onClick={openAddModal} leftIcon={<PlusCircleIcon />}>{t('addNewClinicListingButton')}</Button>
            </div>

            {isLoading && clinicSpaceListings.length === 0 ? <p>{t('loading')}...</p> : 
             clinicSpaceListings.length === 0 ? (
                <div className="text-center py-10 border-2 border-dashed border-gray-300 rounded-lg">
                    <BriefcaseIcon className="w-12 h-12 text-gray-400 mx-auto mb-3"/>
                    <p className="text-gray-500">{t('noClinicSpacesListedMessage')}</p>
                    <Button variant="secondary" className="mt-4" onClick={openAddModal}>{t('createFirstListingButton')}</Button>
                </div>
            ) : (
                <div className="space-y-4">
                    {clinicSpaceListings.map(listing => (
                        <div key={listing.id} className="p-4 border border-gray-200 rounded-lg bg-gray-50/10 hover:shadow-md transition-shadow">
                            <div className="flex flex-col sm:flex-row justify-between sm:items-start">
                                <div>
                                    <h4 className="text-lg font-medium text-textOnLight">{listing.name}</h4>
                                    <p className="text-sm text-gray-400 line-clamp-2">{listing.description}</p>
                                    <p className="text-xs text-accent mt-1">
                                        ${listing.rentalPrice} {listing.rentalDuration}
                                    </p>
                                </div>
                                <div className="flex-shrink-0 mt-3 sm:mt-0 sm:ms-4 space-x-2">
                                    <Button variant="ghost" size="sm" onClick={() => openEditModal(listing)} leftIcon={<PencilIcon className="w-4 h-4"/>} className="!text-blue-400 hover:!bg-blue-50/20">{t('editButtonLabel')}</Button>
                                    <Button variant="danger" size="sm" onClick={() => handleDelete(listing.id)} leftIcon={<TrashIcon className="w-4 h-4"/>} className="!text-red-400 hover:!bg-red-50/20">{t('deleteButtonLabel')}</Button>
                                </div>
                            </div>
                             {listing.photos && listing.photos.length > 0 && (
                                <div className="mt-3 flex space-x-2 overflow-x-auto pb-2">
                                    {listing.photos.map((photoUrl, idx) => (
                                        <img key={idx} src={photoUrl} alt={`${listing.name} photo ${idx + 1}`} className="h-20 w-28 object-cover rounded-md border border-gray-600"/>
                                    ))}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
            <ClinicSpaceListingFormModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSave={handleSaveListing}
                initialListing={editingListing}
                isLoading={isLoading}
            />
        </div>
    );
};


// --- Analytics Tab ---
const ClinicAnalyticsTabContent: React.FC = () => {
    const { t, direction } = useTranslation();
    usePageTitle('dashboardAnalyticsTab');
    const { analyticsData, isLoading } = useOutletContext<OutletContextType>();
    
    if (isLoading && !analyticsData) return <div className="p-6 text-center text-textOnLight">{t('loading')}...</div>;

    // Replace with actual data from analyticsData once structure is known
    const mockProfileViews = analyticsData?.profileViews || 0; 
    const mockTherapistConnections = analyticsData?.therapistConnections || 0;

    return (
        <div className="bg-primary p-6 rounded-lg shadow text-textOnLight">
            <h3 className="text-xl font-semibold mb-4 flex items-center text-accent"><ChartBarIcon className={`w-6 h-6 ${direction === 'rtl' ? 'ms-2' : 'me-2'}`}/>{t('clinicEngagementMetricsTitle')}</h3>
            
            {!analyticsData && !isLoading ? (
                 <div className="mt-6 p-4 border-2 border-dashed border-gray-300 rounded-lg text-center">
                    <ChartBarIcon className="w-12 h-12 text-gray-400 mx-auto mb-2"/>
                    <p className="text-gray-500">{t('viewTrendsOverTimePlaceholder')}</p>
                    <p className="text-xs text-gray-400 mt-1">({t('featureComingSoon', { default: 'Feature coming soon'})})</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-4 border border-gray-200 rounded-lg bg-gray-50/10">
                        <h4 className="font-medium">{t('totalClinicViewsLabel')}</h4>
                        <p className="text-2xl font-bold text-accent">{mockProfileViews}</p>
                        <p className="text-xs text-gray-400">({t('past30DaysLabel', { default: 'Past 30 days'})})</p>
                    </div>
                    <div className="p-4 border border-gray-200 rounded-lg bg-gray-50/10">
                        <h4 className="font-medium">{t('totalTherapistConnectionsLabel')}</h4>
                        <p className="text-2xl font-bold text-accent">{mockTherapistConnections}</p>
                        <p className="text-xs text-gray-400">({t('viaPlatformFeaturesLabel', { default: 'via Platform Features'})})</p>
                    </div>
                </div>
            )}
           
        </div>
    );
};

// --- Settings Tab ---
const ClinicSettingsTabContent: React.FC = () => {
    const { t, direction } = useTranslation();
    usePageTitle('dashboardSettingsTab');
    const { clinicData, clinicOwnerUser, handleOwnerUserSave, handleMembershipApplication, isLoading, membershipHistory } = useOutletContext<OutletContextType>();
    
    const [ownerData, setOwnerData] = useState<Partial<UserManagementInfo>>(clinicOwnerUser || {});
    const [paymentReceiptFile, setPaymentReceiptFile] = useState<File | null>(null);
    const [activeSection, setActiveSection] = useState<string | null>('ownerInfo'); 

    useEffect(() => setOwnerData(clinicOwnerUser || {}), [clinicOwnerUser]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setOwnerData(prev => ({ ...prev, [e.target.name]: e.target.value }));
    };

    const handleSaveOwnerInfo = async (e: React.FormEvent) => {
        e.preventDefault();
        await handleOwnerUserSave(ownerData);
    };

    const handleMembershipSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!paymentReceiptFile && !clinicData?.theraWayMembership?.paymentReceiptUrl) {
            alert(t('paymentReceiptRequiredError', { default: 'Payment receipt is required.' }));
            return;
        }
        await handleMembershipApplication(paymentReceiptFile);
        setPaymentReceiptFile(null); 
        const receiptInput = document.getElementById('clinicPaymentReceiptFile') as HTMLInputElement;
        if(receiptInput) receiptInput.value = "";
    };

    const getAccountStatusPill = (status: Clinic['accountStatus'] | undefined) => {
        if (!status) return null;
        let colorClasses = 'bg-gray-100 text-gray-800';
        let textKey = `clinicAccountStatus${status.charAt(0).toUpperCase() + status.slice(1).replace('_', '')}`;
        
        switch (status) {
            case 'live': colorClasses = 'bg-green-100 text-green-700'; break;
            case 'pending_approval': colorClasses = 'bg-yellow-100 text-yellow-700'; break;
            case 'rejected': colorClasses = 'bg-red-100 text-red-700'; break;
            case 'draft': colorClasses = 'bg-blue-100 text-blue-700'; break;
        }
        return <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${colorClasses}`}>{t(textKey, {default: status})}</span>;
    };

    const needsMembershipAction = !clinicData?.theraWayMembership || 
                                  clinicData.theraWayMembership.status === 'none' || 
                                  clinicData.theraWayMembership.status === 'expired' || 
                                  clinicData.theraWayMembership.status === 'cancelled' ||
                                  clinicData.accountStatus === 'rejected';

    const toggleAccordion = (sectionName: string) => {
        setActiveSection(activeSection === sectionName ? null : sectionName);
    };

    const handlePasswordChange = async () => {
        // Placeholder for API call
        alert(t('featureComingSoon'));
    };
    
    const handleAccountDeletion = async () => {
        // Placeholder for API call
        alert(t('featureComingSoon'));
    };
    
    if (isLoading && !clinicOwnerUser && !clinicData) return <div className="p-6 text-center"><p className="text-textOnLight">{t('loading')}</p></div>;

    return (
        <div className="bg-primary p-0 sm:p-6 rounded-lg shadow text-textOnLight space-y-3">
            <AccordionSection 
                titleKey="editPersonalInformationTitle" 
                icon={<UsersIcon />}
                isOpen={activeSection === 'ownerInfo'}
                onClick={() => toggleAccordion('ownerInfo')}
            >
                <form onSubmit={handleSaveOwnerInfo} className="space-y-4">
                    <InputField label={t('fullName')} id="name" name="name" value={ownerData.name || ''} onChange={handleChange} />
                    <InputField label={t('emailAddress')} id="email" name="email" type="email" value={ownerData.email || ''} onChange={handleChange} />
                    <Button type="submit" disabled={isLoading}>{isLoading ? t('saving') : t('saveChangesButtonLabel')}</Button>
                </form>
            </AccordionSection>
            
            <AccordionSection 
                titleKey="membershipManagementTitle" 
                icon={<CheckCircleIcon />}
                isOpen={activeSection === 'membership'}
                onClick={() => toggleAccordion('membership')}
                badgeText={clinicData?.accountStatus ? t(`clinicAccountStatus${clinicData.accountStatus.charAt(0).toUpperCase() + clinicData.accountStatus.slice(1).replace('_', '')}`, {default: clinicData.accountStatus}) : undefined}
                badgeColor={
                    clinicData?.accountStatus === 'live' ? 'bg-green-100 text-green-700' :
                    clinicData?.accountStatus === 'pending_approval' ? 'bg-yellow-100 text-yellow-700' :
                    clinicData?.accountStatus === 'rejected' ? 'bg-red-100 text-red-700' :
                    'bg-blue-100 text-blue-700' // draft
                }
            >
                <div className="mb-3">
                    <p className="text-sm text-gray-600">{t('accountStatusLabel')}: {getAccountStatusPill(clinicData?.accountStatus)}</p>
                    {clinicData?.theraWayMembership?.status === 'active' && clinicData?.theraWayMembership.renewalDate && (
                        <p className="text-sm text-gray-600">{t('renewalDateLabel')}: <span className="font-semibold text-textOnLight">{new Date(clinicData.theraWayMembership.renewalDate).toLocaleDateString()}</span></p>
                    )}
                    {clinicData?.accountStatus === 'rejected' && clinicData.adminNotes && (
                         <p className="text-sm text-red-600 mt-1">{t('adminNotesLabel')}: <span className="font-normal">{clinicData.adminNotes}</span></p>
                    )}
                    {clinicData?.theraWayMembership?.status === 'pending_approval' && clinicData?.theraWayMembership.applicationDate &&(
                         <p className="text-sm text-yellow-600 mt-1">{t('applicationStatusMessageLabel', {default: 'Application Status:'})} {t('applicationUnderReviewMsg')}</p>
                    )}
                </div>

                {needsMembershipAction && (
                    <form onSubmit={handleMembershipSubmit} className="mt-4 pt-4 border-t border-dashed border-gray-200 space-y-3">
                        <h5 className="font-medium text-textOnLight">
                            {clinicData?.accountStatus === 'rejected' ? t('resubmitApplicationTitle', {default: 'Resubmit Membership Application'}) :
                             (clinicData?.theraWayMembership?.status === 'expired' ? t('renewMembershipTitle', {default: 'Renew Your Membership'}) :
                             t('applyForMembershipTitle', {default: 'Apply for Membership'}))
                            } ({t('clinicMembershipFeeLabel', {price: CLINIC_MEMBERSHIP_FEE})})
                        </h5>
                        <FileUploadField 
                            label={t('attachPaymentReceiptLabel')} 
                            id="clinicPaymentReceiptFile"
                            onFileChange={setPaymentReceiptFile}
                            currentFileUrl={clinicData?.theraWayMembership?.paymentReceiptUrl}
                            maxSizeMB={PAYMENT_RECEIPT_MAX_SIZE_MB}
                            accept=".pdf,.jpg,.png"
                            description={t('paymentReceiptDescription', {size: PAYMENT_RECEIPT_MAX_SIZE_MB})}
                            required={!clinicData?.theraWayMembership?.paymentReceiptUrl}
                        />
                        <Button type="submit" disabled={isLoading || (!paymentReceiptFile && !clinicData?.theraWayMembership?.paymentReceiptUrl)}>
                            {isLoading ? t('submittingApplication') : 
                             ((clinicData?.theraWayMembership?.status === 'expired' ? t('renewMembershipButtonLabel') : t('applyForMembershipButtonLabel')))}
                        </Button>
                    </form>
                )}
                 { isLoading && membershipHistory.length === 0 ? <p>{t('loading')}...</p> :
                   membershipHistory.length > 0 ? (
                    <div className="mt-4 pt-4 border-t border-dashed">
                        <h5 className="text-sm font-medium text-gray-500 mb-1">{t('membershipHistoryTitle')}</h5>
                        <ul className="space-y-1 text-xs text-gray-400 max-h-24 overflow-y-auto">
                            {membershipHistory.map(item => (
                                <li key={item.id}><strong>{new Date(item.date).toLocaleDateString()}:</strong> {item.action}</li>
                            ))}
                        </ul>
                    </div>
                ) : <p className="text-xs text-gray-400 mt-2">{t('noMembershipHistoryAvailable')}</p>}
            </AccordionSection>
            
            <AccordionSection
                titleKey="clinicAccountStatusDescriptionsTitle"
                icon={<InformationCircleIcon />}
                isOpen={activeSection === 'statusDescriptions'}
                onClick={() => toggleAccordion('statusDescriptions')}
            >
                 <ul className="space-y-2 text-sm text-gray-600">
                    <li><strong>{t('clinicAccountStatusDraft')}:</strong> {t('clinicAccountStatusDraftDescription')}</li>
                    <li><strong>{t('clinicAccountStatusPendingApproval')}:</strong> {t('clinicAccountStatusPendingApprovalDescription')}</li>
                    <li><strong>{t('clinicAccountStatusLive')}:</strong> {t('clinicAccountStatusLiveDescription')}</li>
                    <li><strong>{t('clinicAccountStatusRejected')}:</strong> {t('clinicAccountStatusRejectedDescription')}</li>
                </ul>
            </AccordionSection>

            <AccordionSection 
                titleKey="managePasswordButton" 
                icon={<CogIcon />}
                isOpen={activeSection === 'password'}
                onClick={() => toggleAccordion('password')}
            >
                 <Button variant="secondary" onClick={handlePasswordChange} disabled={isLoading}>{t('changePasswordButtonLabel', { default: 'Change Password'})}</Button>
                 {/* <p className="text-xs text-gray-400 mt-1">({t('featureComingSoon', { default: 'Feature coming soon'})})</p> */}
            </AccordionSection>

            <AccordionSection 
                titleKey="deleteYourAccountButton" 
                icon={<TrashIcon />}
                isOpen={activeSection === 'deleteAccount'}
                onClick={() => toggleAccordion('deleteAccount')}
            >
                 <p className="text-sm text-red-600 mb-3">{t('deleteAccountWarningText')}</p>
                 <Button variant="danger" onClick={handleAccountDeletion} disabled={isLoading}>{t('requestAccountDeletionButtonLabel')}</Button>
                 {/* <p className="text-xs text-gray-400 mt-1">({t('featureComingSoon', { default: 'Feature coming soon'})})</p> */}
            </AccordionSection>
        </div>
    );
};


// --- Main Clinic Owner Dashboard Page Component ---
export const ClinicOwnerDashboardPage: React.FC = () => {
  const { user, token, updateUserAuthContext } = useAuth(); 
  const { t } = useTranslation();
  const [clinicData, setClinicData] = useState<Clinic | null>(null);
  const [clinicOwnerUser, setClinicOwnerUser] = useState<UserManagementInfo | null>(null);
  const [clinicSpaceListings, setClinicSpaceListings] = useState<ClinicSpaceListing[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [membershipHistory, setMembershipHistory] = useState<MembershipHistoryItem[]>([]);
  const [analyticsData, setAnalyticsData] = useState<any>(null); // Placeholder

  const fetchDashboardData = useCallback(async () => {
    if (user && token) {
        setIsLoading(true);
        try {
            // Fetch clinic profile
            const clinicResponse = await fetch(`${API_BASE_URL}/clinic_profile.php?ownerId=${user.id}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const clinicProfileData = await clinicResponse.json();
            if (clinicProfileData.status === 'success' && clinicProfileData.clinic) {
                setClinicData(clinicProfileData.clinic);
                setClinicSpaceListings(clinicProfileData.clinic.listings || []); // Assuming listings are part of clinic data for now
            } else if (clinicProfileData.status === 'not_found') {
                 const newClinicId = `clinic-${user.id}-${Date.now().toString().slice(-5)}`;
                 const newClinic: Clinic = { 
                    id: newClinicId, ownerId: user.id, name: t('newClinicNamePlaceholder', {name: user.name || t('my', {default: 'My'})}),
                    profilePictureUrl: `https://picsum.photos/seed/${newClinicId}/600/400`, photos: [],
                    amenities: [t('waitingRoom'), t('wifi'), t('restroom')],
                    operatingHours: {'Monday-Friday': '9am - 5pm', 'Saturday': '10am - 2pm'},
                    services: [], address: '', whatsappNumber: '', description: t('newClinicDescriptionPlaceholder'),
                    isVerified: false, theraWayMembership: { status: 'none', tierName: STANDARD_MEMBERSHIP_TIER_NAME },
                    accountStatus: 'draft'
                 };
                 setClinicData(newClinic);
                 setClinicSpaceListings([]);
            } else {
                 console.error("Failed to fetch clinic data:", clinicProfileData.message);
            }
            setClinicOwnerUser({id: user.id, name: user.name || "Clinic Owner", email: user.email, role: UserRole.CLINIC_OWNER, isActive: true, profilePictureUrl: user.profilePictureUrl});

            // Fetch Membership History (if clinicData exists)
            if (clinicProfileData.status === 'success' && clinicProfileData.clinic) {
                const historyResponse = await fetch(`${API_BASE_URL}/clinic_membership_history.php?clinicId=${clinicProfileData.clinic.id}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const historyData = await historyResponse.json();
                if (historyData.status === 'success' && historyData.history) {
                    setMembershipHistory(historyData.history);
                } else {
                    setMembershipHistory([]);
                }
            }
            
            // Fetch Analytics Data (if clinicData exists)
            if (clinicProfileData.status === 'success' && clinicProfileData.clinic) {
                const analyticsResponse = await fetch(`${API_BASE_URL}/clinic_analytics.php?clinicId=${clinicProfileData.clinic.id}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const analyticsApiData = await analyticsResponse.json();
                if (analyticsApiData.status === 'success' && analyticsApiData.analytics) {
                    setAnalyticsData(analyticsApiData.analytics);
                } else {
                    setAnalyticsData(null); // Or some default error state
                }
            }

        } catch (error) {
            console.error("API error fetching clinic dashboard data:", error);
        } finally {
            setIsLoading(false);
        }
    }
  }, [user, token, t]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  const handleFileUpload = async (file: File, uploadType: string, itemId?: string): Promise<string | null> => {
    if (!token) return null;
    const formData = new FormData();
    formData.append(uploadType, file); 
    formData.append('uploadType', uploadType);
    if (itemId) formData.append('itemId', itemId); 

    try {
        const response = await fetch(`${API_BASE_URL}/upload.php`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData,
        });
        const data = await response.json();
        if (data.status === 'success' && data.fileUrl) {
            return data.fileUrl;
        }
        console.error('File upload failed:', data.message);
        return null;
    } catch (error) {
        console.error('File upload API error:', error);
        return null;
    }
  };

  const handleClinicProfileSave = async (updatedProfileData: Partial<Clinic>, profilePicFile?: File | null) => {
    if (!user || !token || !clinicData) return;
    setIsLoading(true);
    let dataToSave = { ...clinicData, ...updatedProfileData };

    if (profilePicFile) {
        const newUrl = await handleFileUpload(profilePicFile, 'clinicProfilePicture', clinicData.id);
        if (newUrl) dataToSave.profilePictureUrl = newUrl;
        else { setIsLoading(false); alert("Clinic profile picture upload failed."); return; }
    }
    try {
        const response = await fetch(`${API_BASE_URL}/clinic_profile.php`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify(dataToSave),
        });
        const result = await response.json();
        if (result.status === 'success' && result.clinic) {
            setClinicData(result.clinic);
            alert(t('clinicProfileSavedSuccess'));
        } else {
            throw new Error(result.message || "Failed to save clinic profile");
        }
    } catch (error: any) {
        alert(`Error: ${error.message}`);
    }
    setIsLoading(false);
  };
  
  const handleMembershipApplication = async (receiptFile: File | null) => {
    if (!user || !token || !clinicData) return;
    setIsLoading(true);
    let paymentReceiptUrl: string | null | undefined = clinicData.theraWayMembership?.paymentReceiptUrl;

    if (receiptFile) {
        paymentReceiptUrl = await handleFileUpload(receiptFile, 'clinicPaymentReceipt', clinicData.id);
        if (!paymentReceiptUrl) {
            setIsLoading(false);
            alert("Payment receipt upload failed.");
            return;
        }
    }
    if (!paymentReceiptUrl) {
        alert(t('paymentReceiptRequiredError'));
        setIsLoading(false);
        return;
    }
    
    const applicationPayload = {
        clinicId: clinicData.id,
        ownerId: user.id,
        paymentReceiptUrl,
        applicationDate: new Date().toISOString(),
    };
    try {
        const response = await fetch(`${API_BASE_URL}/clinic_membership.php`, { 
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify(applicationPayload),
        });
        const data = await response.json();
        if (data.status === 'success' && data.clinic) {
            setClinicData(data.clinic); 
            await fetchDashboardData(); // Refetch to get updated history
            alert(t('membershipApplicationSubmitted'));
        } else {
            throw new Error(data.message || "Failed to submit membership application");
        }
    } catch (error: any) {
        alert(`Error: ${error.message}`);
    }
    setIsLoading(false);
  };

  const handleAddOrUpdateSpaceListing = async (listing: ClinicSpaceListing, photoFiles: (File | null)[]) => {
    if (!user || !token || !clinicData) return;
    setIsLoading(true);
    
    const uploadedPhotoUrls = await Promise.all(
        photoFiles.map(async (file, index) => {
            if (file) {
                return await handleFileUpload(file, `spacePhoto_${index}`, listing.id);
            }
            return listing.photos?.[index]; 
        })
    );
    
    const finalListing = { 
        ...listing, 
        photos: uploadedPhotoUrls.filter(url => url) as string[], 
        clinicId: clinicData.id, 
        clinicName: clinicData.name,
        clinicAddress: clinicData.address
    };

    try {
        const response = await fetch(`${API_BASE_URL}/clinic_spaces.php`, { 
            method: listing.id.startsWith('space-') ? 'POST' : 'PUT',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify(finalListing),
        });
        const data = await response.json();
        if (data.status === 'success' && data.listing) {
            setClinicSpaceListings(prev => {
                const existingIndex = prev.findIndex(l => l.id === data.listing.id);
                if (existingIndex > -1) {
                    const newListings = [...prev];
                    newListings[existingIndex] = data.listing;
                    return newListings;
                }
                return [...prev, data.listing];
            });
            alert(t('clinicSpaceListingSavedSuccess'));
        } else {
            throw new Error(data.message || "Failed to save space listing");
        }
    } catch (error: any) {
        alert(`Error: ${error.message}`);
    }
    setIsLoading(false);
  };
  
  const handleDeleteSpaceListing = async (listingId: string) => {
     if (!user || !token) return;
     if (!confirm(t('deleteListingConfirm', { default: 'Are you sure you want to delete this listing?' }))) return;
     setIsLoading(true);
     try {
        const response = await fetch(`${API_BASE_URL}/clinic_spaces.php`, { 
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ listingId }),
        });
        const data = await response.json();
        if (data.status === 'success') {
            setClinicSpaceListings(prev => prev.filter(l => l.id !== listingId));
            alert(t('clinicSpaceListingDeletedSuccess'));
        } else {
            throw new Error(data.message || "Failed to delete space listing");
        }
    } catch (error: any) {
        alert(`Error: ${error.message}`);
    }
     setIsLoading(false);
  };

  const handleOwnerUserSave = async (updatedUser: Partial<UserManagementInfo>) => {
    if (!user || !token) return;
    setIsLoading(true);
    try {
        const response = await fetch(`${API_BASE_URL}/user_profile.php`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ ...updatedUser, userId: user.id }),
        });
        const data = await response.json();
        if (data.status === 'success' && data.user) {
            setClinicOwnerUser(data.user);
            updateUserAuthContext(data.user); 
            alert(t('personalInfoSavedSuccess'));
        } else {
            throw new Error(data.message || "Failed to save owner info");
        }
    } catch (error: any) {
        alert(`Error: ${error.message}`);
    }
    setIsLoading(false);
  };

  // Placeholder for password change
  const handleChangePassword = async (passwords: {currentPassword?: string, newPassword?: string}) => {
    if (!token) return;
    // Example: POST to /user_profile.php with action: 'change_password'
    console.log("Attempting to change password:", passwords);
    alert(t('featureComingSoon'));
    // try {
    //   const response = await fetch(`${API_BASE_URL}/user_profile.php`, {
    //     method: 'POST', 
    //     headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    //     body: JSON.stringify({ action: 'change_password', ...passwords }),
    //   });
    //   // ... handle response
    // } catch (error) { /* ... */ }
  };

  // Placeholder for account deletion request
  const handleAccountDeletionRequest = async () => {
    if (!token) return;
    // Example: POST to /user_profile.php with action: 'request_deletion'
    console.log("Requesting account deletion");
    alert(t('featureComingSoon'));
    // try {
    //   const response = await fetch(`${API_BASE_URL}/user_profile.php`, {
    //     method: 'POST',
    //     headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    //     body: JSON.stringify({ action: 'request_deletion' }),
    //   });
    //   // ... handle response (e.g., log out user, show confirmation)
    // } catch (error) { /* ... */ }
  };

  
  const contextValue: OutletContextType = { 
    clinicData, 
    clinicOwnerUser,
    clinicSpaceListings, 
    handleClinicProfileSave, 
    handleMembershipApplication,
    handleAddOrUpdateSpaceListing,
    handleDeleteSpaceListing,
    handleOwnerUserSave,
    isLoading,
    membershipHistory,
    analyticsData
  };

  return (
    <DashboardLayout role={UserRole.CLINIC_OWNER}>
      <Outlet context={contextValue} />
    </DashboardLayout>
  );
};

export const ClinicOwnerDashboardRoutes = () => (
    <Routes>
        <Route element={<ClinicOwnerDashboardPage />}>
            <Route index element={<ClinicProfileTabContent />} />
            <Route path="my-clinics" element={<MyClinicListingsTabContent />} />
            <Route path="analytics" element={<ClinicAnalyticsTabContent />} />
            <Route path="settings" element={<ClinicSettingsTabContent />} />
        </Route>
    </Routes>
);