import React from 'react';
import { useTranslation } from '../../../hooks/useTranslation';

interface SyncIndicatorProps {
  isSyncing: boolean;
  lastSynced?: Date | null;
  syncError?: string | null;
}

export const SyncIndicator: React.FC<SyncIndicatorProps> = ({ 
  isSyncing, 
  lastSynced, 
  syncError 
}) => {
  const { t } = useTranslation();
  
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
  
  if (lastSynced) {
    return (
      <div className="flex items-center text-xs text-green-600">
        <span className="w-2 h-2 bg-green-600 rounded-full mr-1"></span>
        <span>
          {t('lastSynced', { 
            time: lastSynced.toLocaleTimeString(), 
            default: `Last synced: ${lastSynced.toLocaleTimeString()}` 
          })}
        </span>
      </div>
    );
  }
  
  return null;
};