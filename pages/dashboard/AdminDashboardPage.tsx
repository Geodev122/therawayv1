
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Outlet, Route, Routes, useOutletContext } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from '../../hooks/useTranslation';
import { usePageTitle } from '../../hooks/usePageTitle';
import { UserRole, Therapist, Clinic, UserInquiry, ActivityLog } from '../../types';
import { API_BASE_URL } from '../../constants'; 
import { DashboardLayout } from '../../components/dashboard/shared/DashboardLayout';
import { Button } from '../../components/common/Button';
import { InputField, TextareaField } from '../../components/dashboard/shared/FormElements';
import { Modal } from '../../components/common/Modal';
import { 
    UsersIcon, BuildingOfficeIcon, ChatBubbleLeftRightIcon, DocumentTextIcon, 
    CheckCircleIcon, XCircleIcon, ExclamationTriangleIcon, EyeIcon, PencilIcon, ArrowDownTrayIcon 
} from '../../components/icons';

interface OutletContextType {
  therapistsList: Therapist[];
  clinicsList: Clinic[];
  userInquiriesList: UserInquiry[];
  activityLogsList: ActivityLog[];
  handleTherapistStatusChange: (therapistId: string, status: Therapist['accountStatus'], notes?: string) => Promise<void>;
  handleClinicStatusChange: (clinicId: string, status: Clinic['accountStatus'], notes?: string) => Promise<void>;
  handleInquiryStatusChange: (inquiryId: string, status: UserInquiry['status'], adminReply?: string) => Promise<void>;
  addActivityLog: (logEntry: Omit<ActivityLog, 'id' | 'timestamp'>) => Promise<void>;
  isLoading: boolean;
}

// --- Add Note Modal ---
interface AddNoteModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (note: string) => void;
    currentNote?: string;
    targetName: string;
}
const AddNoteModal: React.FC<AddNoteModalProps> = ({ isOpen, onClose, onSave, currentNote, targetName }) => {
    const { t } = useTranslation();
    const [note, setNote] = useState(currentNote || '');
    useEffect(() => { if(isOpen) setNote(currentNote || ''); }, [isOpen, currentNote]);

    const handleSubmit = () => {
        onSave(note);
        onClose();
    };
    return (
        <Modal isOpen={isOpen} onClose={onClose} title={t('addAdminNoteModalTitle', { targetName })} size="lg">
            <TextareaField
                label={t('adminNoteLabel')}
                id="adminNote"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={4}
                placeholder={t('adminNotePlaceholder')}
            />
            <div className="mt-4 flex justify-end space-x-2">
                <Button variant="light" onClick={onClose}>{t('cancelButtonLabel')}</Button>
                <Button variant="primary" onClick={handleSubmit}>{t('saveNoteButtonLabel')}</Button>
            </div>
        </Modal>
    );
};

// --- View Message Modal ---
interface ViewMessageModalProps {
    isOpen: boolean;
    onClose: () => void;
    inquiry: UserInquiry | null;
}
const ViewMessageModal: React.FC<ViewMessageModalProps> = ({ isOpen, onClose, inquiry }) => {
    const { t } = useTranslation();
    if (!inquiry) return null;
    return (
        <Modal isOpen={isOpen} onClose={onClose} title={t('viewInquiryModalTitle', { subject: inquiry.subject })} size="lg">
            <p className="text-sm text-gray-500 mb-1"><strong>{t('fromLabel')}:</strong> {inquiry.userName || 'N/A'} ({inquiry.userEmail})</p>
            <p className="text-sm text-gray-500 mb-3"><strong>{t('dateLabel')}:</strong> {new Date(inquiry.date).toLocaleString()}</p>
            <div className="bg-gray-50 p-3 rounded whitespace-pre-wrap text-sm">{inquiry.message}</div>
            {inquiry.adminReply && (
                 <div className="mt-4 pt-3 border-t">
                    <h4 className="font-semibold text-sm mb-1">{t('adminReplyLabel')}:</h4>
                    <p className="bg-blue-50 p-3 rounded whitespace-pre-wrap text-sm">{inquiry.adminReply}</p>
                 </div>
            )}
        </Modal>
    );
};

// --- Respond to Inquiry Modal ---
interface RespondToInquiryModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSendReply: (reply: string) => void;
    inquirySubject: string;
}
const RespondToInquiryModal: React.FC<RespondToInquiryModalProps> = ({ isOpen, onClose, onSendReply, inquirySubject }) => {
    const { t } = useTranslation();
    const [reply, setReply] = useState('');
    useEffect(() => { if(isOpen) setReply(''); }, [isOpen]);

    const handleSubmit = () => {
        onSendReply(reply);
        onClose();
    };
    return (
        <Modal isOpen={isOpen} onClose={onClose} title={t('respondToInquiryModalTitle', { subject: inquirySubject })} size="lg">
            <TextareaField
                label={t('yourReplyLabel')}
                id="adminReply"
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                rows={5}
                placeholder={t('typeYourReplyPlaceholder')}
            />
            <div className="mt-4 flex justify-end space-x-2">
                <Button variant="light" onClick={onClose}>{t('cancelButtonLabel')}</Button>
                <Button variant="primary" onClick={handleSubmit}>{t('sendReplyButtonLabel')}</Button>
            </div>
        </Modal>
    );
};


// --- Therapists Validation Tab ---
const AdminTherapistsValidationTabContent: React.FC = () => {
    usePageTitle('dashboardTherapistsValidationTab');
    const { t, direction } = useTranslation();
    const { therapistsList, handleTherapistStatusChange, isLoading, addActivityLog } = useOutletContext<OutletContextType>();
    const [searchTerm, setSearchTerm] = useState('');
    const [noteModalOpen, setNoteModalOpen] = useState(false);
    const [selectedTarget, setSelectedTarget] = useState<{id: string; name: string; currentNotes?: string} | null>(null);

    const filteredTherapists = useMemo(() => 
        therapistsList.filter(therapist => 
            therapist.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (therapist.email && therapist.email.toLowerCase().includes(searchTerm.toLowerCase()))
        )
    , [therapistsList, searchTerm]);

    const totalApplications = therapistsList.length;
    const activeTherapists = therapistsList.filter(t => t.accountStatus === 'live').length;
    const draftAccounts = therapistsList.filter(t => t.accountStatus === 'draft').length;
    const pendingApplications = therapistsList.filter(t => t.accountStatus === 'pending_approval').length;
    const rejectedApplications = therapistsList.filter(t => t.accountStatus === 'rejected').length;


    const openAddNoteModal = (therapist: Therapist) => {
        setSelectedTarget({ id: therapist.id, name: therapist.name, currentNotes: therapist.adminNotes });
        setNoteModalOpen(true);
    };
    const handleSaveNote = async (note: string) => {
        if(selectedTarget) {
            const therapist = therapistsList.find(t => t.id === selectedTarget.id);
            if (therapist) await handleTherapistStatusChange(selectedTarget.id, therapist.accountStatus, note);
        }
    };
    
    const handleAction = async (therapistId: string, newStatus: Therapist['accountStatus']) => {
        const therapist = therapistsList.find(t => t.id === therapistId);
        if (therapist) {
            if (newStatus === 'rejected' && !therapist.adminNotes) {
                openAddNoteModal(therapist); 
            } else {
                await handleTherapistStatusChange(therapistId, newStatus, therapist.adminNotes);
            }
        }
    };

    const handleExportData = () => {
        console.log("Exporting therapist data (mock):", filteredTherapists);
        addActivityLog({ action: "Exported Therapist Data", targetType: 'therapist', details: { count: filteredTherapists.length, filters: searchTerm }});
        alert(t('exportDataSuccessMessage', {default: 'Data exported to console (mock).'}));
    };


    return (
        <div className="space-y-6 bg-primary p-4 sm:p-6 rounded-lg shadow-md text-textOnLight">
            <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mb-4 pb-4 border-b border-gray-300">
                <h3 className="text-xl font-semibold text-accent flex items-center">
                    <UsersIcon className={`w-6 h-6 ${direction === 'rtl' ? 'ml-2' : 'mr-2'}`}/>
                    {t('therapistAccountManagementTitle')}
                </h3>
                <Button variant="light" size="sm" onClick={handleExportData} leftIcon={<ArrowDownTrayIcon className="w-4 h-4"/>}>
                    {t('exportDataButton')}
                </Button>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6 text-center">
                {[
                    { labelKey: 'totalApplicationsLabel', value: totalApplications, color: 'bg-blue-500' },
                    { labelKey: 'activeTherapistsLabel', value: activeTherapists, color: 'bg-green-500' },
                    { labelKey: 'pendingApplicationsLabel', value: pendingApplications, color: 'bg-yellow-500' },
                    { labelKey: 'rejectedApplicationsLabel', value: rejectedApplications, color: 'bg-red-500' },
                    { labelKey: 'draftAccountsLabel', value: draftAccounts, color: 'bg-gray-500' },
                ].map(stat => (
                    <div key={stat.labelKey} className={`p-3 rounded-lg shadow ${stat.color} text-white`}>
                        <p className="text-2xl font-bold">{stat.value}</p>
                        <p className="text-xs opacity-90">{t(stat.labelKey)}</p>
                    </div>
                ))}
            </div>


            <InputField
                label={t('searchTherapistsInputLabel')}
                id="therapistSearch"
                placeholder={t('searchTherapistsPlaceholder')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                containerClassName="mb-4"
            />

            {isLoading && therapistsList.length === 0 ? <p>{t('loadingTherapistData')}</p> :
             filteredTherapists.length === 0 ? <p className="text-center py-4">{t('noTherapistsFoundWithCriteria')}</p> :
            (
                <div className="overflow-x-auto shadow-md rounded-lg border border-gray-300">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-secondary/50 text-textOnLight">
                            <tr>
                                <th scope="col" className={`px-4 py-3 text-xs font-medium uppercase tracking-wider ${direction === 'rtl' ? 'text-right' : 'text-left'}`}>{t('therapistNameColumn')}</th>
                                <th scope="col" className="px-4 py-3 text-xs font-medium uppercase tracking-wider hidden md:table-cell">{t('therapistEmailColumn')}</th>
                                <th scope="col" className="px-4 py-3 text-xs font-medium uppercase tracking-wider">{t('therapistStatusColumn')}</th>
                                <th scope="col" className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-center">{t('therapistActionsColumn')}</th>
                            </tr>
                        </thead>
                        <tbody className="bg-primary divide-y divide-gray-200">
                            {filteredTherapists.map(therapist => (
                                <tr key={therapist.id} className="hover:bg-secondary/30 transition-colors">
                                    <td className="px-4 py-3 whitespace-nowrap text-textOnLight">
                                        <div className="text-sm font-medium">{therapist.name}</div>
                                        <div className="text-xs text-gray-400 md:hidden">{therapist.email || 'N/A'}</div>
                                        {therapist.adminNotes && <div className="text-xs text-yellow-500 mt-1 truncate max-w-xs md:max-w-sm" title={therapist.adminNotes}>{t('notePrefix')}{therapist.adminNotes}</div>}
                                    </td>
                                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-400 hidden md:table-cell">{therapist.email || 'N/A'}</td>
                                    <td className="px-4 py-3 whitespace-nowrap text-xs">
                                        <span className={`px-2 inline-flex leading-5 font-semibold rounded-full 
                                            ${therapist.accountStatus === 'live' ? 'bg-green-100 text-green-700' : 
                                             therapist.accountStatus === 'pending_approval' ? 'bg-yellow-100 text-yellow-700' :
                                             therapist.accountStatus === 'rejected' ? 'bg-red-100 text-red-700' : 
                                             'bg-gray-100 text-gray-700'}`}>
                                            {t(`therapistAccountStatus${therapist.accountStatus.charAt(0).toUpperCase() + therapist.accountStatus.slice(1).replace('_','')}`, {default: therapist.accountStatus})}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 whitespace-nowrap text-center text-sm font-medium">
                                        <div className="flex items-center justify-center space-x-1 sm:space-x-2">
                                            {therapist.accountStatus !== 'live' && <Button variant="ghost" size="sm" className="!text-green-500 hover:!bg-green-100 !p-1" onClick={() => handleAction(therapist.id, 'live')} title={t('approveTherapistButton')}><CheckCircleIcon className="w-4 h-4"/></Button>}
                                            {therapist.accountStatus !== 'rejected' && <Button variant="ghost" size="sm" className="!text-red-500 hover:!bg-red-100 !p-1" onClick={() => handleAction(therapist.id, 'rejected')} title={t('rejectTherapistButton')}><XCircleIcon className="w-4 h-4"/></Button>}
                                            <Button variant="ghost" size="sm" className="!text-blue-500 hover:!bg-blue-100 !p-1" onClick={() => openAddNoteModal(therapist)} title={t('addEditNoteButton')}><PencilIcon className="w-4 h-4"/></Button>
                                            {/* TODO: Link to view therapist full profile (maybe in a modal or new page) */}
                                            {/* <Button variant="ghost" size="sm" className="!text-gray-400 hover:!bg-gray-100 !p-1" title={t('viewTherapistProfileButton')}><EyeIcon className="w-4 h-4"/></Button> */}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
             <AddNoteModal isOpen={noteModalOpen} onClose={() => setNoteModalOpen(false)} onSave={handleSaveNote} currentNote={selectedTarget?.currentNotes} targetName={selectedTarget?.name || ''} />
        </div>
    );
};

// --- Clinic Approval Tab ---
const AdminClinicApprovalTabContent: React.FC = () => {
    usePageTitle('dashboardClinicApprovalTab');
    const { t, direction } = useTranslation();
    const { clinicsList, handleClinicStatusChange, isLoading, addActivityLog } = useOutletContext<OutletContextType>();
    const [searchTerm, setSearchTerm] = useState('');
    const [noteModalOpen, setNoteModalOpen] = useState(false);
    const [selectedTarget, setSelectedTarget] = useState<{id: string; name: string; currentNotes?: string} | null>(null);


    const filteredClinics = useMemo(() =>
        clinicsList.filter(clinic =>
            clinic.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            clinic.id.includes(searchTerm) // assuming owner email is fetched with clinic or searchable by owner ID
        )
    , [clinicsList, searchTerm]);
    
    const totalClinics = clinicsList.length;
    const activeClinics = clinicsList.filter(c => c.accountStatus === 'live').length;
    const draftClinics = clinicsList.filter(c => c.accountStatus === 'draft').length;
    const pendingClinics = clinicsList.filter(c => c.accountStatus === 'pending_approval').length;
    const rejectedClinics = clinicsList.filter(c => c.accountStatus === 'rejected').length;

    const openAddNoteModal = (clinic: Clinic) => {
        setSelectedTarget({ id: clinic.id, name: clinic.name, currentNotes: clinic.adminNotes });
        setNoteModalOpen(true);
    };
    const handleSaveNote = async (note: string) => {
         if(selectedTarget) {
            const clinic = clinicsList.find(c => c.id === selectedTarget.id);
            if (clinic) await handleClinicStatusChange(selectedTarget.id, clinic.accountStatus, note);
        }
    };
    
    const handleAction = async (clinicId: string, newStatus: Clinic['accountStatus']) => {
        const clinic = clinicsList.find(c => c.id === clinicId);
        if (clinic) {
            if (newStatus === 'rejected' && !clinic.adminNotes) {
                 openAddNoteModal(clinic);
            } else {
                 await handleClinicStatusChange(clinicId, newStatus, clinic.adminNotes);
            }
        }
    };

    const handleExportData = () => {
        console.log("Exporting clinic data (mock):", filteredClinics);
        addActivityLog({ action: "Exported Clinic Data", targetType: 'clinic', details: { count: filteredClinics.length, filters: searchTerm }});
        alert(t('exportDataSuccessMessage'));
    };

    return (
        <div className="space-y-6 bg-primary p-4 sm:p-6 rounded-lg shadow-md text-textOnLight">
             <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mb-4 pb-4 border-b border-gray-300">
                <h3 className="text-xl font-semibold text-accent flex items-center">
                    <BuildingOfficeIcon className={`w-6 h-6 ${direction === 'rtl' ? 'ml-2' : 'mr-2'}`}/>
                    {t('clinicAccountManagementTitle')}
                </h3>
                <Button variant="light" size="sm" onClick={handleExportData} leftIcon={<ArrowDownTrayIcon className="w-4 h-4"/>}>
                    {t('exportDataButton')}
                </Button>
            </div>
            
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6 text-center">
                {[
                    { labelKey: 'totalClinicsLabel', value: totalClinics, color: 'bg-blue-500' },
                    { labelKey: 'activeClinicsLabel', value: activeClinics, color: 'bg-green-500' },
                    { labelKey: 'pendingClinicsLabel', value: pendingClinics, color: 'bg-yellow-500' },
                    { labelKey: 'rejectedClinicsLabel', value: rejectedClinics, color: 'bg-red-500' },
                    { labelKey: 'draftClinicsLabel', value: draftClinics, color: 'bg-gray-500' },
                ].map(stat => (
                    <div key={stat.labelKey} className={`p-3 rounded-lg shadow ${stat.color} text-white`}>
                        <p className="text-2xl font-bold">{stat.value}</p>
                        <p className="text-xs opacity-90">{t(stat.labelKey)}</p>
                    </div>
                ))}
            </div>

            <InputField
                label={t('searchClinicsInputLabel')}
                id="clinicSearch"
                placeholder={t('searchClinicsPlaceholder')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                containerClassName="mb-4"
            />

            {isLoading && clinicsList.length === 0 ? <p>{t('loadingClinicData')}</p> :
             filteredClinics.length === 0 ? <p className="text-center py-4">{t('noClinicsFoundWithCriteria')}</p> :
            (
                <div className="overflow-x-auto shadow-md rounded-lg border border-gray-300">
                    <table className="min-w-full divide-y divide-gray-200">
                         <thead className="bg-secondary/50 text-textOnLight">
                            <tr>
                                <th scope="col" className={`px-4 py-3 text-xs font-medium uppercase tracking-wider ${direction === 'rtl' ? 'text-right' : 'text-left'}`}>{t('clinicNameColumn')}</th>
                                <th scope="col" className="px-4 py-3 text-xs font-medium uppercase tracking-wider hidden md:table-cell">{t('clinicOwnerEmailColumn')}</th>
                                <th scope="col" className="px-4 py-3 text-xs font-medium uppercase tracking-wider">{t('clinicStatusColumn')}</th>
                                <th scope="col" className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-center">{t('clinicActionsColumn')}</th>
                            </tr>
                        </thead>
                        <tbody className="bg-primary divide-y divide-gray-200">
                            {filteredClinics.map(clinic => (
                                <tr key={clinic.id} className="hover:bg-secondary/30 transition-colors">
                                    <td className="px-4 py-3 whitespace-nowrap text-textOnLight">
                                        <div className="text-sm font-medium">{clinic.name}</div>
                                        <div className="text-xs text-gray-400 md:hidden">{clinic.ownerId}</div> {/* Show owner ID if email not readily available */}
                                        {clinic.adminNotes && <div className="text-xs text-yellow-500 mt-1 truncate max-w-xs md:max-w-sm" title={clinic.adminNotes}>{t('notePrefix')}{clinic.adminNotes}</div>}
                                    </td>
                                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-400 hidden md:table-cell">{clinic.ownerId}</td>
                                    <td className="px-4 py-3 whitespace-nowrap text-xs">
                                        <span className={`px-2 inline-flex leading-5 font-semibold rounded-full 
                                            ${clinic.accountStatus === 'live' ? 'bg-green-100 text-green-700' : 
                                             clinic.accountStatus === 'pending_approval' ? 'bg-yellow-100 text-yellow-700' :
                                             clinic.accountStatus === 'rejected' ? 'bg-red-100 text-red-700' : 
                                             'bg-gray-100 text-gray-700'}`}>
                                             {t(`clinicAccountStatus${clinic.accountStatus.charAt(0).toUpperCase() + clinic.accountStatus.slice(1).replace('_','')}`, {default: clinic.accountStatus})}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 whitespace-nowrap text-center text-sm font-medium">
                                        <div className="flex items-center justify-center space-x-1 sm:space-x-2">
                                            {clinic.accountStatus !== 'live' && <Button variant="ghost" size="sm" className="!text-green-500 hover:!bg-green-100 !p-1" onClick={() => handleAction(clinic.id, 'live')} title={t('approveClinicButton')}><CheckCircleIcon className="w-4 h-4"/></Button>}
                                            {clinic.accountStatus !== 'rejected' && <Button variant="ghost" size="sm" className="!text-red-500 hover:!bg-red-100 !p-1" onClick={() => handleAction(clinic.id, 'rejected')} title={t('rejectClinicButton')}><XCircleIcon className="w-4 h-4"/></Button>}
                                            <Button variant="ghost" size="sm" className="!text-blue-500 hover:!bg-blue-100 !p-1" onClick={() => openAddNoteModal(clinic)} title={t('addEditNoteButton')}><PencilIcon className="w-4 h-4"/></Button>
                                            {/* <Button variant="ghost" size="sm" className="!text-gray-400 hover:!bg-gray-100 !p-1" title={t('viewClinicProfileButton')}><EyeIcon className="w-4 h-4"/></Button> */}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
             <AddNoteModal isOpen={noteModalOpen} onClose={() => setNoteModalOpen(false)} onSave={handleSaveNote} currentNote={selectedTarget?.currentNotes} targetName={selectedTarget?.name || ''} />
        </div>
    );
};

// --- Communication Tab ---
const AdminCommunicationTabContent: React.FC = () => {
    usePageTitle('dashboardCommunicationTab');
    const { t, direction } = useTranslation();
    const { userInquiriesList, handleInquiryStatusChange, isLoading, addActivityLog } = useOutletContext<OutletContextType>();
    const [filterStatus, setFilterStatus] = useState<'all' | UserInquiry['status']>('all');
    const [viewMessageModalOpen, setViewMessageModalOpen] = useState(false);
    const [respondModalOpen, setRespondModalOpen] = useState(false);
    const [selectedInquiry, setSelectedInquiry] = useState<UserInquiry | null>(null);


    const filteredInquiries = useMemo(() =>
        userInquiriesList.filter(inquiry =>
            filterStatus === 'all' || inquiry.status === filterStatus
        )
    , [userInquiriesList, filterStatus]);

    const openViewMessageModal = (inquiry: UserInquiry) => {
        setSelectedInquiry(inquiry);
        setViewMessageModalOpen(true);
    };
    const openRespondModal = (inquiry: UserInquiry) => {
        setSelectedInquiry(inquiry);
        setRespondModalOpen(true);
    };
    const handleSendReply = async (reply: string) => {
        if (selectedInquiry) {
            await handleInquiryStatusChange(selectedInquiry.id, 'closed', reply);
             addActivityLog({ action: 'Replied to User Inquiry', targetId: selectedInquiry.id, targetType: 'user_inquiry', details: { subject: selectedInquiry.subject, replyLength: reply.length } });
        }
    };
    const handleChangeStatus = async (inquiryId: string, newStatus: UserInquiry['status']) => {
        const inquiry = userInquiriesList.find(i => i.id === inquiryId);
        if (inquiry) {
            await handleInquiryStatusChange(inquiryId, newStatus, inquiry.adminReply);
            addActivityLog({ action: `Inquiry Status Changed to ${newStatus}`, targetId: inquiryId, targetType: 'user_inquiry', details: { subject: inquiry.subject } });
        }
    };
    
    const getStatusPill = (status: UserInquiry['status']) => {
        let color = 'bg-gray-100 text-gray-700';
        if (status === 'open') color = 'bg-blue-100 text-blue-700';
        else if (status === 'closed') color = 'bg-green-100 text-green-700';
        else if (status === 'pending_admin_response') color = 'bg-yellow-100 text-yellow-700';
        else if (status === 'escalated') color = 'bg-red-100 text-red-700';
        return <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${color}`}>{t(`inquiryStatus${status.charAt(0).toUpperCase() + status.slice(1).replace(/_([a-z])/g, (g) => g[1].toUpperCase())}`, {default: status})}</span>;
    };

    const statusOptions: {value: 'all' | UserInquiry['status'], labelKey: string}[] = [
        { value: 'all', labelKey: 'inquiryStatusAll' },
        { value: 'open', labelKey: 'inquiryStatusOpen' },
        { value: 'pending_admin_response', labelKey: 'inquiryStatusPendingAdminResponse' },
        { value: 'closed', labelKey: 'inquiryStatusClosed' },
        { value: 'escalated', labelKey: 'inquiryStatusEscalated' },
    ];

    return (
        <div className="space-y-6 bg-primary p-4 sm:p-6 rounded-lg shadow-md text-textOnLight">
            <h3 className="text-xl font-semibold text-accent flex items-center mb-4 pb-4 border-b border-gray-300">
                <ChatBubbleLeftRightIcon className={`w-6 h-6 ${direction === 'rtl' ? 'ml-2' : 'mr-2'}`}/>
                {t('userInquiriesManagementTitle')}
            </h3>

            <div className="mb-4">
                <label htmlFor="inquiryStatusFilter" className="block text-sm font-medium text-gray-500 mb-1">{t('filterByStatusLabel')}</label>
                <select
                    id="inquiryStatusFilter"
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value as 'all' | UserInquiry['status'])}
                    className="bg-primary border border-gray-300 text-textOnLight text-sm rounded-lg focus:ring-accent focus:border-accent block w-full sm:w-1/3 p-2.5"
                >
                    {statusOptions.map(opt => <option key={opt.value} value={opt.value}>{t(opt.labelKey)}</option>)}
                </select>
            </div>

            {isLoading && userInquiriesList.length === 0 ? <p>{t('loadingUserInquiries')}</p> :
             filteredInquiries.length === 0 ? <p className="text-center py-4">{t('noInquiriesFoundWithFilter')}</p> :
            (
                <div className="overflow-x-auto shadow-md rounded-lg border border-gray-300">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-secondary/50 text-textOnLight">
                            <tr>
                                <th scope="col" className={`px-4 py-3 text-xs font-medium uppercase tracking-wider ${direction === 'rtl' ? 'text-right' : 'text-left'}`}>{t('inquirySubjectColumn')}</th>
                                <th scope="col" className="px-4 py-3 text-xs font-medium uppercase tracking-wider hidden md:table-cell">{t('inquiryUserColumn')}</th>
                                <th scope="col" className="px-4 py-3 text-xs font-medium uppercase tracking-wider hidden sm:table-cell">{t('inquiryDateColumn')}</th>
                                <th scope="col" className="px-4 py-3 text-xs font-medium uppercase tracking-wider">{t('inquiryStatusColumn')}</th>
                                <th scope="col" className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-center">{t('inquiryActionsColumn')}</th>
                            </tr>
                        </thead>
                        <tbody className="bg-primary divide-y divide-gray-200">
                            {filteredInquiries.map(inquiry => (
                                <tr key={inquiry.id} className="hover:bg-secondary/30 transition-colors">
                                    <td className="px-4 py-3 text-textOnLight">
                                        <div className="text-sm font-medium truncate max-w-xs" title={inquiry.subject}>{inquiry.subject}</div>
                                        <div className="text-xs text-gray-400 md:hidden">{inquiry.userName || inquiry.userEmail}</div>
                                    </td>
                                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 hidden md:table-cell">{inquiry.userName || 'N/A'} ({inquiry.userEmail})</td>
                                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-400 hidden sm:table-cell">{new Date(inquiry.date).toLocaleDateString()}</td>
                                    <td className="px-4 py-3 whitespace-nowrap">{getStatusPill(inquiry.status)}</td>
                                    <td className="px-4 py-3 whitespace-nowrap text-center text-sm font-medium">
                                        <div className="flex items-center justify-center space-x-1 sm:space-x-2">
                                            <Button variant="ghost" size="sm" className="!text-blue-500 hover:!bg-blue-100 !p-1" onClick={() => openViewMessageModal(inquiry)} title={t('viewMessageButton')}><EyeIcon className="w-4 h-4"/></Button>
                                            {inquiry.status !== 'closed' && <Button variant="ghost" size="sm" className="!text-green-500 hover:!bg-green-100 !p-1" onClick={() => openRespondModal(inquiry)} title={t('respondButton')}><PencilIcon className="w-4 h-4"/></Button>}
                                            {inquiry.status === 'open' && <Button variant="ghost" size="sm" className="!text-yellow-500 hover:!bg-yellow-100 !p-1" onClick={() => handleChangeStatus(inquiry.id, 'pending_admin_response')} title={t('markAsPendingButton')}><ExclamationTriangleIcon className="w-4 h-4"/></Button>}
                                            {inquiry.status !== 'escalated' && inquiry.status !== 'closed' && <Button variant="ghost" size="sm" className="!text-red-500 hover:!bg-red-100 !p-1" onClick={() => handleChangeStatus(inquiry.id, 'escalated')} title={t('escalateButton')}><ExclamationTriangleIcon className="w-4 h-4"/></Button> }
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
            <ViewMessageModal isOpen={viewMessageModalOpen} onClose={() => setViewMessageModalOpen(false)} inquiry={selectedInquiry} />
            <RespondToInquiryModal isOpen={respondModalOpen} onClose={() => setRespondModalOpen(false)} onSendReply={handleSendReply} inquirySubject={selectedInquiry?.subject || ''} />
        </div>
    );
};


// --- Activity Log Tab ---
const AdminActivityLogTabContent: React.FC = () => {
    usePageTitle('dashboardActivityLogTab');
    const { t, direction } = useTranslation();
    const { activityLogsList, isLoading, addActivityLog } = useOutletContext<OutletContextType>(); // Assuming addActivityLog is for manual additions, if any
    const [filterAction, setFilterAction] = useState('');
    const [filterUser, setFilterUser] = useState('');

    const filteredLogs = useMemo(() =>
        activityLogsList.filter(log =>
            (filterAction ? log.action.toLowerCase().includes(filterAction.toLowerCase()) : true) &&
            (filterUser ? (log.userName?.toLowerCase().includes(filterUser.toLowerCase()) || log.userId?.includes(filterUser.toLowerCase())) : true)
        ).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()) // Sort newest first
    , [activityLogsList, filterAction, filterUser]);

    return (
        <div className="space-y-6 bg-primary p-4 sm:p-6 rounded-lg shadow-md text-textOnLight">
             <h3 className="text-xl font-semibold text-accent flex items-center mb-4 pb-4 border-b border-gray-300">
                <DocumentTextIcon className={`w-6 h-6 ${direction === 'rtl' ? 'ml-2' : 'mr-2'}`}/>
                {t('systemActivityLogTitle')}
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <InputField
                    label={t('filterByActionLabel')}
                    id="filterAction"
                    placeholder={t('filterByActionPlaceholder')}
                    value={filterAction}
                    onChange={(e) => setFilterAction(e.target.value)}
                />
                <InputField
                    label={t('filterByUserLabel')}
                    id="filterUser"
                    placeholder={t('filterByUserPlaceholder')}
                    value={filterUser}
                    onChange={(e) => setFilterUser(e.target.value)}
                />
            </div>

            {isLoading && activityLogsList.length === 0 ? <p>{t('loadingActivityLogs')}</p> :
             filteredLogs.length === 0 ? <p className="text-center py-4">{t('noActivityLogsFoundWithFilter')}</p> :
            (
                <div className="overflow-x-auto shadow-md rounded-lg border border-gray-300 max-h-[60vh]">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-secondary/50 text-textOnLight sticky top-0 z-10">
                            <tr>
                                <th scope="col" className={`px-4 py-3 text-xs font-medium uppercase tracking-wider ${direction === 'rtl' ? 'text-right' : 'text-left'}`}>{t('logTimestampColumn')}</th>
                                <th scope="col" className={`px-4 py-3 text-xs font-medium uppercase tracking-wider ${direction === 'rtl' ? 'text-right' : 'text-left'}`}>{t('logActionColumn')}</th>
                                <th scope="col" className="px-4 py-3 text-xs font-medium uppercase tracking-wider hidden sm:table-cell">{t('logUserColumn')}</th>
                                <th scope="col" className="px-4 py-3 text-xs font-medium uppercase tracking-wider hidden md:table-cell">{t('logTargetColumn')}</th>
                                <th scope="col" className={`px-4 py-3 text-xs font-medium uppercase tracking-wider ${direction === 'rtl' ? 'text-right' : 'text-left'}`}>{t('logDetailsColumn')}</th>
                            </tr>
                        </thead>
                        <tbody className="bg-primary divide-y divide-gray-200">
                            {filteredLogs.map(log => (
                                <tr key={log.id} className="hover:bg-secondary/30 transition-colors">
                                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">{new Date(log.timestamp).toLocaleString()}</td>
                                    <td className="px-4 py-3 text-sm text-textOnLight">{log.action}</td>
                                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-400 hidden sm:table-cell">
                                        {log.userName || log.userId || 'System'}
                                        {log.userRole && <span className="text-xs text-gray-500"> ({log.userRole})</span>}
                                    </td>
                                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-400 hidden md:table-cell">
                                        {log.targetType?.replace('_', ' ').toUpperCase()}: {log.targetId || 'N/A'}
                                    </td>
                                    <td className="px-4 py-3 text-xs text-gray-500 truncate max-w-xs" title={typeof log.details === 'string' ? log.details : JSON.stringify(log.details)}>
                                        {typeof log.details === 'string' ? log.details : JSON.stringify(log.details)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};


// --- Main Admin Dashboard Page Shell ---
const AdminDashboardPageShell: React.FC = () => {
    const { user, token } = useAuth();
    const { t } = useTranslation();
    const [isLoading, setIsLoading] = useState(true);
    const [therapistsList, setTherapistsList] = useState<Therapist[]>([]);
    const [clinicsList, setClinicsList] = useState<Clinic[]>([]);
    const [userInquiriesList, setUserInquiriesList] = useState<UserInquiry[]>([]);
    const [activityLogsList, setActivityLogsList] = useState<ActivityLog[]>([]);

    const fetchData = useCallback(async (endpoint: string, setter: Function) => {
        if (!token) return;
        // TODO: Implement actual API calls
        try {
            const response = await fetch(`${API_BASE_URL}/${endpoint}`, { headers: { 'Authorization': `Bearer ${token}` } });
            const data = await response.json();
            if (data.status === 'success') {
                setter(data.data || []); // Assuming data is in data.data
            } else {
                console.error(`Failed to fetch ${endpoint}:`, data.message);
                setter([]);
            }
        } catch (error) {
            console.error(`API error fetching ${endpoint}:`, error);
            setter([]);
        }
    }, [token]);

    useEffect(() => {
        const loadAllData = async () => {
            setIsLoading(true);
            await Promise.all([
                fetchData('admin_therapists.php', setTherapistsList),
                fetchData('admin_clinics.php', setClinicsList),
                fetchData('admin_inquiries.php', setUserInquiriesList),
                fetchData('admin_activitylog.php', setActivityLogsList),
            ]);
            setIsLoading(false);
        };
        loadAllData();
    }, [fetchData]);

    const addActivityLog = async (logEntry: Omit<ActivityLog, 'id' | 'timestamp'>) => {
        if (!token || !user) return;
        // TODO: Implement API call to POST new activity log
        const newLog = { 
            ...logEntry, 
            id: `log-${Date.now()}`, 
            timestamp: new Date().toISOString(), 
            userId: user.id, 
            userName: user.name,
            userRole: user.role
        };
        try {
            const response = await fetch(`${API_BASE_URL}/admin_activitylog.php`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(newLog)
            });
            const data = await response.json();
            if(data.status === 'success' && data.log) {
                setActivityLogsList(prev => [data.log, ...prev]);
            } else {
                 console.error("Failed to add activity log:", data.message);
                 setActivityLogsList(prev => [newLog, ...prev]); // Optimistic fallback
            }
        } catch (error) {
             console.error("API error adding activity log:", error);
             setActivityLogsList(prev => [newLog, ...prev]); // Optimistic fallback
        }
    };
    
    const handleStatusChange = async (
        id: string,
        status: Therapist['accountStatus'] | Clinic['accountStatus'],
        notes: string | undefined,
        type: 'therapist' | 'clinic'
    ) => {
        if (!token) return;
        setIsLoading(true);
        const endpoint = type === 'therapist' ? 'admin_therapists.php' : 'admin_clinics.php';
        const payload = { id, status, adminNotes: notes };
        
        // TODO: Implement actual API calls
        try {
            const response = await fetch(`${API_BASE_URL}/${endpoint}`, {
                method: 'PUT', // Or POST depending on API design
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(payload),
            });
            const data = await response.json();
            if (data.status === 'success') {
                if (type === 'therapist' && data.therapist) {
                    setTherapistsList(prev => prev.map(t => t.id === id ? data.therapist : t));
                } else if (type === 'clinic' && data.clinic) {
                    setClinicsList(prev => prev.map(c => c.id === id ? data.clinic : c));
                }
                addActivityLog({ action: `${type.charAt(0).toUpperCase() + type.slice(1)} Status Changed to ${status}`, targetId: id, targetType: type, details: { notesPresent: !!notes } });
            } else {
                throw new Error(data.message || `Failed to update ${type} status`);
            }
        } catch (error: any) {
             alert(`Error: ${error.message}`);
        }
        setIsLoading(false);
    };

    const handleTherapistStatusChange = (therapistId: string, status: Therapist['accountStatus'], notes?: string) => 
        handleStatusChange(therapistId, status, notes, 'therapist');
    
    const handleClinicStatusChange = (clinicId: string, status: Clinic['accountStatus'], notes?: string) =>
        handleStatusChange(clinicId, status, notes, 'clinic');

    const handleInquiryStatusChange = async (inquiryId: string, status: UserInquiry['status'], adminReply?: string) => {
        if (!token) return;
        setIsLoading(true);
         // TODO: Implement actual API call
        try {
            const response = await fetch(`${API_BASE_URL}/admin_inquiries.php`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ id: inquiryId, status, adminReply }),
            });
            const data = await response.json();
            if (data.status === 'success' && data.inquiry) {
                setUserInquiriesList(prev => prev.map(i => i.id === inquiryId ? data.inquiry : i));
            } else {
                throw new Error(data.message || "Failed to update inquiry status");
            }
        } catch (error: any) {
             alert(`Error: ${error.message}`);
        }
        setIsLoading(false);
    };

    const outletContextValue: OutletContextType = {
        therapistsList,
        clinicsList,
        userInquiriesList,
        activityLogsList,
        handleTherapistStatusChange,
        handleClinicStatusChange,
        handleInquiryStatusChange,
        addActivityLog,
        isLoading,
    };

    return (
        <DashboardLayout role={UserRole.ADMIN}>
            <Outlet context={outletContextValue} />
        </DashboardLayout>
    );
};

export const AdminDashboardRoutes = () => (
    <Routes>
        <Route element={<AdminDashboardPageShell />}>
            <Route index element={<AdminTherapistsValidationTabContent />} />
            <Route path="clinic-approval" element={<AdminClinicApprovalTabContent />} />
            <Route path="communication" element={<AdminCommunicationTabContent />} />
            <Route path="activity-log" element={<AdminActivityLogTabContent />} />
        </Route>
    </Routes>
);