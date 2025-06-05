import React from 'react';
import { useOfflineStatus } from '../hooks/useOfflineStatus';
import { useTranslation } from '../hooks/useTranslation';

export const OfflineNotification: React.FC = () => {
  const isOffline = useOfflineStatus();
  const { t } = useTranslation();
  
  if (!isOffline) return null;
  
  return (
    <div 
      id="offline-notification"
      className="fixed bottom-16 left-0 right-0 bg-yellow-500 text-white py-2 px-4 text-center z-50"
    >
      {t('offlineNotification', { default: 'You are currently offline. Some features may be limited.' })}
    </div>
  );
};