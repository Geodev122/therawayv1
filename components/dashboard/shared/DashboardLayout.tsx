import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { UserRole } from '../../../types';
import { 
    BriefcaseIcon, BuildingOfficeIcon, ShieldCheckIcon, ChartBarIcon, CogIcon, UsersIcon, 
    DocumentDuplicateIcon, TagIcon, PhotoIcon, ChevronDownIcon, ChevronUpIcon,
    ChatBubbleLeftRightIcon, DocumentTextIcon // Added new icons
} from '../../icons'; 
import { useTranslation } from '../../../hooks/useTranslation';

interface DashboardLayoutProps {
  role: UserRole;
  children?: React.ReactNode; 
}

interface NavItem {
  path: string;
  labelKey: string; 
  icon: React.ReactNode;
  adminOnly?: boolean;
  therapistOnly?: boolean;
  clinicOnly?: boolean;
}

// Updated for new Therapist Dashboard Structure (Profile, Licenses, Space Rental, Settings)
const therapistNavItems: NavItem[] = [
  { path: '', labelKey: 'dashboardMyProfileTab', icon: <BriefcaseIcon />, therapistOnly: true }, 
  { path: 'licenses', labelKey: 'dashboardLicensesTab', icon: <DocumentDuplicateIcon />, therapistOnly: true},
  { path: 'space-rental', labelKey: 'dashboardSpaceRentalTab', icon: <BuildingOfficeIcon />, therapistOnly: true}, 
  { path: 'settings', labelKey: 'dashboardSettingsTab', icon: <CogIcon />, therapistOnly: true },
];

// Updated for new Clinic Owner Dashboard Structure
const clinicNavItems: NavItem[] = [
  { path: '', labelKey: 'dashboardClinicProfileTab', icon: <BuildingOfficeIcon />, clinicOnly: true }, 
  { path: 'my-clinics', labelKey: 'dashboardMyClinicsTab', icon: <BriefcaseIcon />, clinicOnly: true}, 
  { path: 'analytics', labelKey: 'dashboardAnalyticsTab', icon: <ChartBarIcon />, clinicOnly: true}, 
  { path: 'settings', labelKey: 'dashboardSettingsTab', icon: <CogIcon />, clinicOnly: true}, 
];

// NEW Admin Panel Navigation
const adminNavItems: NavItem[] = [
  { path: '', labelKey: 'dashboardTherapistsValidationTab', icon: <UsersIcon /> }, // Therapists Validation is the default
  { path: 'clinic-approval', labelKey: 'dashboardClinicApprovalTab', icon: <BuildingOfficeIcon /> },
  { path: 'communication', labelKey: 'dashboardCommunicationTab', icon: <ChatBubbleLeftRightIcon /> },
  { path: 'activity-log', labelKey: 'dashboardActivityLogTab', icon: <DocumentTextIcon /> },
];


export const DashboardLayout: React.FC<DashboardLayoutProps> = ({ role, children }) => {
  const { t, direction } = useTranslation();
  let navItems: NavItem[] = [];
  let dashboardTitleKey = '';
  let baseRoute = '';

  switch (role) {
    case UserRole.THERAPIST:
      navItems = therapistNavItems;
      dashboardTitleKey = 'dashboardTherapistTitle';
      baseRoute = '/dashboard/therapist';
      break;
    case UserRole.CLINIC_OWNER:
      navItems = clinicNavItems;
      dashboardTitleKey = 'dashboardClinicOwnerTitle';
      baseRoute = '/dashboard/clinic';
      break;
    case UserRole.ADMIN:
      navItems = adminNavItems; // Use new admin nav items
      dashboardTitleKey = 'dashboardAdminTitle';
      baseRoute = '/dashboard/admin';
      break;
    default:
      return <div className="p-8 text-textOnLight">{t('invalidDashboardRole', {default: 'Invalid dashboard role.'})}</div>;
  }
  
  navItems = navItems.filter(item => 
    (!item.adminOnly || role === UserRole.ADMIN) &&
    (!item.therapistOnly || role === UserRole.THERAPIST) &&
    (!item.clinicOnly || role === UserRole.CLINIC_OWNER)
  );

  return (
    <div className="flex flex-col flex-grow"> 
      <main className="flex-grow p-6 bg-primary text-textOnLight overflow-y-auto pt-6 pb-[calc(70px+1rem)]"> 
        <h2 className="text-2xl font-semibold text-accent mb-6">{t(dashboardTitleKey)}</h2>
        {children || <Outlet />} 
      </main>

      <nav 
        className="fixed bottom-0 left-0 right-0 h-[70px] bg-background/90 backdrop-blur-md border-t border-accent/20 shadow-top-lg z-50 flex justify-around items-center"
        aria-label={t('dashboardNavigationLabel', { default: 'Dashboard Navigation' })}
      >
        {navItems.map(item => (
          <NavLink
            key={item.path}
            to={`${baseRoute}/${item.path}`.replace(/\/$/, '')} 
            end={item.path === ''} 
            className={({ isActive }) =>
              `flex-1 flex flex-col items-center justify-center h-full p-1 group focus:outline-none focus:ring-1 focus:ring-accent/50 focus:ring-offset-1 focus:ring-offset-background relative
               transition-all duration-200 ease-in-out active:scale-95 hover:scale-[1.02] hover:bg-accent/10
              ${
                isActive 
                  ? 'text-accent scale-105 font-semibold shadow-[0_0_10px_rgba(4,83,88,0.35)]' // Updated shadow color to accent based
                  : 'text-textOnLight/70 hover:text-accent' 
              }`
            }
          >
            {({ isActive }) => (
              <>
                <span className={`w-5 h-5 mb-0.5 transition-transform duration-200 ease-in-out ${direction === 'rtl' ? '' : ''} group-hover:scale-110`}>{item.icon}</span>
                <span className="text-xs truncate transition-opacity duration-200 ease-in-out group-hover:opacity-100">{t(item.labelKey)}</span>
                {/* Underline removed, active state handled by shadow and scale in NavLink className */}
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  );
};