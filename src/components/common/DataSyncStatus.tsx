import React from 'react';
import { useTranslation } from '../hooks/useTranslation.ts';
import { useOfflineStatus } from '../hooks/useOfflineStatus.ts';

interface DataSyncStatusProps {
  lastSyncTime?: Date | null;
  isSyncing?: boolean;
  syncError?: string | null;
}

export const DataSyncStatus: React.FC<DataSyncStatusProps> = ({
  lastSyncTime,
  isSyncing = false,
  syncError = null
}) => {
  const { t } = useTranslation();
  const isOffline = useOfflineStatus();
  
  if (syncError) {
    return (
      <div className="flex items-center text-xs text-red-600">
        <span className="w-2 h-2 bg-red-600 rounded-full mr-1"></span>
        <span>{t('syncError', { default: 'Sync error' })}</span>
      </div>
    );
  }
  
  if (isSyncing) {
    return (
      <div className="flex items-center text-xs text-blue-600">
        <span className="w-2 h-2 bg-blue-600 rounded-full mr-1 animate-pulse"></span>
        <span>{t('syncing', { default: 'Syncing...' })}</span>
      </div>
    );
  }
  
  if (isOffline) {
    return (
      <div className="flex items-center text-xs text-yellow-600">
        <span className="w-2 h-2 bg-yellow-600 rounded-full mr-1"></span>
        <span>{t('offline', { default: 'Offline' })}</span>
      </div>
    );
  }
  
  if (lastSyncTime) {
    return (
      <div className="flex items-center text-xs text-green-600">
        <span className="w-2 h-2 bg-green-600 rounded-full mr-1"></span>
        <span>
          {t('lastSynced', { 
            time: lastSyncTime.toLocaleTimeString(), 
            default: `Last synced: ${lastSyncTime.toLocaleTimeString()}` 
          })}
        </span>
      </div>
    );
  }
  
  return (
    <div className="flex items-center text-xs text-gray-500">
      <span className="w-2 h-2 bg-gray-500 rounded-full mr-1"></span>
      <span>{t('notSynced', { default: 'Not synced' })}</span>
    </div>
  );
};