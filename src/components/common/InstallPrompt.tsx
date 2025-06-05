import React, { useState, useEffect } from 'react';
import { Button } from '../../../components/common/Button';
import { useTranslation } from '../../hooks/useTranslation';

export const InstallPrompt: React.FC = () => {
  const { t } = useTranslation();
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isAppInstalled, setIsAppInstalled] = useState(false);
  
  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      // Prevent Chrome 67 and earlier from automatically showing the prompt
      e.preventDefault();
      // Stash the event so it can be triggered later
      setDeferredPrompt(e);
    };
    
    const handleAppInstalled = () => {
      setIsAppInstalled(true);
      setDeferredPrompt(null);
    };
    
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);
    
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);
  
  const handleInstallClick = () => {
    if (!deferredPrompt) return;
    
    // Show the install prompt
    deferredPrompt.prompt();
    
    // Wait for the user to respond to the prompt
    deferredPrompt.userChoice.then((choiceResult: any) => {
      if (choiceResult.outcome === 'accepted') {
        console.log('User accepted the install prompt');
      } else {
        console.log('User dismissed the install prompt');
      }
      setDeferredPrompt(null);
    });
  };
  
  if (!deferredPrompt || isAppInstalled) return null;
  
  return (
    <div className="fixed bottom-16 left-0 right-0 bg-primary p-4 shadow-lg border-t border-accent/20 z-40">
      <div className="flex items-center justify-between max-w-4xl mx-auto">
        <p className="text-sm text-textOnLight mr-4">
          {t('installPrompt', { default: 'Install TheraWay for a better experience!' })}
        </p>
        <Button 
          id="install-button"
          variant="primary" 
          size="sm" 
          onClick={handleInstallClick}
        >
          {t('installApp', { default: 'Install App' })}
        </Button>
      </div>
    </div>
  );
};