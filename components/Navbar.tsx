
import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from '../hooks/useTranslation';
import { Button } from './common/Button';
import { UserCircleIcon, MenuIcon, XIcon, BriefcaseIcon, BuildingOfficeIcon, ShieldCheckIcon } from './icons';
import { UserRole } from '../types';

export const Navbar: React.FC = () => {
  const { isAuthenticated, user, logout } = useAuth();
  const { t, language, setLanguage, direction } = useTranslation();
  const navigate = useNavigate();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const handleLogout = () => {
    logout();
    setIsMobileMenuOpen(false);
    navigate('/'); 
  };

  const handleLoginClick = () => {
    setIsMobileMenuOpen(false);
    navigate('/login');
  }

  const toggleLanguage = () => {
    setLanguage(language === 'en' ? 'ar' : 'en');
    setIsMobileMenuOpen(false);
  };

  const publicLinks = [
    { path: '/', labelKey: 'findTherapists' },
  ];

  const authenticatedUserLinks: {path: string, labelKey: string, icon?: React.ReactNode, roles?: UserRole[]}[] = [];

  if (user) {
    if (user.role === UserRole.CLIENT) {
        authenticatedUserLinks.push({ path: '/dashboard/client/profile', labelKey: 'clientProfileManagementTab', icon: <UserCircleIcon className={`w-4 h-4 ${direction === 'rtl' ? 'ms-1.5' : 'me-1.5'}`}/> });
    } else if (user.role === UserRole.THERAPIST) {
        authenticatedUserLinks.push({ path: '/dashboard/therapist', labelKey: 'myDashboard', icon: <BriefcaseIcon className={`w-4 h-4 ${direction === 'rtl' ? 'ms-1.5' : 'me-1.5'}`}/> });
    } else if (user.role === UserRole.CLINIC_OWNER) {
        authenticatedUserLinks.push({ path: '/dashboard/clinic', labelKey: 'clinicDashboard', icon: <BuildingOfficeIcon className={`w-4 h-4 ${direction === 'rtl' ? 'ms-1.5' : 'me-1.5'}`}/> });
    } else if (user.role === UserRole.ADMIN) {
        authenticatedUserLinks.push({ path: '/dashboard/admin', labelKey: 'adminPanel', icon: <ShieldCheckIcon className={`w-4 h-4 ${direction === 'rtl' ? 'ms-1.5' : 'me-1.5'}`}/> });
    }
  }
  
  const commonLinks: {path: string, labelKey: string}[] = [
    // { path: '/about', labelKey: 'aboutUs' },
    // { path: '/contact', labelKey: 'contact' },
  ];

  const linkBaseClass = "px-3 py-2 rounded-md text-sm font-medium transition-colors";
  const desktopLinkClass = `text-textOnLight/80 hover:text-textOnLight hover:bg-gray-100 ${linkBaseClass}`;
  const mobileLinkClass = `text-textOnLight/90 hover:text-textOnLight hover:bg-gray-100 block ${linkBaseClass} text-base`;

  const renderLinks = (isMobile: boolean) => (
    <>
      {publicLinks.map(link => (
        <Link 
          key={link.path} 
          to={link.path} 
          onClick={() => isMobile && setIsMobileMenuOpen(false)}
          className={isMobile ? mobileLinkClass : desktopLinkClass}
        >
          {t(link.labelKey)}
        </Link>
      ))}
      {isAuthenticated && authenticatedUserLinks.filter(l => !l.roles || (user && l.roles.includes(user.role))).map(link => (
         <Link 
          key={link.path} 
          to={link.path} 
          onClick={() => isMobile && setIsMobileMenuOpen(false)}
          className={`${isMobile ? mobileLinkClass : desktopLinkClass} flex items-center`}
        >
          {link.icon}{t(link.labelKey)}
        </Link>
      ))}
      {commonLinks.map(link => (
        <Link 
          key={link.path} 
          to={link.path} 
          onClick={() => isMobile && setIsMobileMenuOpen(false)}
          className={isMobile ? mobileLinkClass : desktopLinkClass}
          >
          {t(link.labelKey)}
        </Link>
      ))}
    </>
  );

  return (
    <nav className="bg-background backdrop-md shadow-lg sticky top-0 z-100 border-b border-accent/120">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center">
            <Link to="/" className="flex items-center text-decoration-none hover:opacity-100 transition-opacity">
              <img src="/app/logo.png" alt="TheraWay Logo" className="h-8 w-auto mr-2" /> {/* Ensure /app/ prefix if base is /app/ */}
              <span className="text-2xl font-bold">
                <span className="text-textOnLight">Thera</span><span className="text-[#15686e]">Way</span>
              </span>
            </Link>
          </div>
          
          <div className="hidden md:flex items-center space-x-1"> 
            {renderLinks(false)}
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleLanguage}
              className="!px-3 !py-2 !text-textOnLight/80 hover:!text-textOnLight hover:!bg-gray-100"
              title={language === 'en' ? 'Switch to Arabic' : 'Switch to English'}
            >
              {language === 'en' ? t('arabic') : t('english')}
            </Button>
            {isAuthenticated && user ? (
              <div className="relative group">
                <Button 
                  variant="ghost" 
                  className={`flex items-center !px-3 !py-2 !text-textOnLight/80 group-hover:!text-textOnLight group-hover:!bg-gray-100`}
                >
                  {user.profilePictureUrl ? (
                    <img src={user.profilePictureUrl} alt={user.name || 'User Avatar'} className={`h-6 w-6 rounded-full object-cover ${direction === 'rtl' ? 'ms-1.5' : 'me-1.5'}`} />
                  ) : (
                    <UserCircleIcon className={`h-5 w-5 text-textOnLight/70 group-hover:text-accent ${direction === 'rtl' ? 'ms-1.5' : 'me-1.5'}`} />
                  )}
                  <span className="text-sm font-medium truncate max-w-[100px]">{user.name}</span>
                </Button>
                <div className={`absolute mt-2 w-56 bg-primary rounded-md shadow-lg py-1 hidden group-hover:block ring-1 ring-black ring-opacity-5 ${direction === 'rtl' ? 'start-0' : 'end-0'}`}>
                  <div className="px-4 py-3 border-b border-gray-200">
                    <p className="text-sm font-medium text-textOnLight truncate">{user.name}</p>
                    <p className="text-xs text-gray-500 truncate">{user.email} ({user.role})</p>
                  </div>
                  <button
                    onClick={handleLogout}
                    className={`block w-full px-4 py-2 text-sm text-textOnLight hover:bg-gray-100 hover:text-accent ${direction === 'rtl' ? 'text-right' : 'text-left'}`}
                  >
                    {t('logout')}
                  </button>
                </div>
              </div>
            ) : (
              <Button variant="primary" size="sm" onClick={handleLoginClick}>
                {t('loginSignup')}
              </Button>
            )}
          </div>

          <div className="md:hidden flex items-center">
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleLanguage}
              className="!p-2 !text-textOnLight/70 hover:!text-accent hover:!bg-gray-100"
              title={language === 'en' ? 'Switch to Arabic' : 'Switch to English'}
            >
              {language === 'en' ? 'AR' : 'EN'}
            </Button>
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className={`inline-flex items-center justify-center p-2 rounded-md text-textOnLight/70 hover:text-accent hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-accent ${direction === 'rtl' ? 'ms-2' : 'me-2'}`}
              aria-controls="mobile-menu"
              aria-expanded={isMobileMenuOpen}
            >
              <span className="sr-only">Open main menu</span>
              {isMobileMenuOpen ? (
                <XIcon className="block h-6 w-6" aria-hidden="true" />
              ) : (
                <MenuIcon className="block h-6 w-6" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>
      </div>

      {isMobileMenuOpen && (
        <div className="bg-card backdrop-blur-md shadow-nav sticky top-0 z-1000 pb-3 w-full border-b border-border-subtle">
          <div className="px-2 pt-2 pb-3 space-y-1 sm:px-3">
            {renderLinks(true)}
          </div>
          <div className="pt-4 pb-3 border-t border-accent/10">
            {isAuthenticated && user ? (
              <>
                <div className="flex items-center px-5">
                  {user.profilePictureUrl ? (
                    <img src={user.profilePictureUrl} alt={user.name || 'User Avatar'} className="h-10 w-10 rounded-full object-cover" />
                  ) : (
                    <UserCircleIcon className="h-10 w-10 text-accent" />
                  )}
                  <div className={`${direction === 'rtl' ? 'me-3' : 'ms-3'}`}>
                    <div className="text-base font-medium text-textOnLight">{user.name}</div>
                    <div className="text-sm font-medium text-textOnLight/70">{user.email} ({user.role})</div>
                  </div>
                </div>
                <div className="mt-3 px-2 space-y-1">
                  <button
                    onClick={handleLogout}
                    className={`${mobileLinkClass} w-full ${direction === 'rtl' ? 'text-right' : 'text-left'}`}
                  >
                    {t('logout')}
                  </button>
                </div>
              </>
            ) : (
              <div className="px-2">
                <Button variant="primary" isFullWidth onClick={handleLoginClick}>
                  {t('loginSignup')}
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </nav>
  );
};
