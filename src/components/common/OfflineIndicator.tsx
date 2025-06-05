import React from 'react';
import { useOfflineStatus } from '../../hooks/useOfflineStatus';
import { useTranslation } from '../../hooks/useTranslation';

export const OfflineIndicator: React.FC = () => {
  const isOffline = useOfflineStatus();
  const { t } = useTranslation();
  
  if (!isOffline) return null;
  
  return (
    <div className="fixed top-16 left-0 right-0 bg-yellow-500 text-white py-2 text-center z-50">
      {t('offlineMode', { default: 'You are currently offline. Some features may be limited.' })}
    </div>
  );
};