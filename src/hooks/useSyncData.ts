import { useState, useEffect, useCallback } from 'react';
import { useOfflineStatus } from './useOfflineStatus';
import { useLocalStorage } from './useLocalStorage';
import { putItem, getAllItems, clearStore } from './useIndexedDB';

interface UseSyncDataOptions {
  syncInterval?: number; // in milliseconds
  forceSync?: boolean;
  syncKey?: string;
}

export function useSyncData<T extends { id: string }>(
  fetchFn: () => Promise<T[]>,
  storeName: string,
  options: UseSyncDataOptions = {}
) {
  const { syncInterval = 5 * 60 * 1000, forceSync = false, syncKey = storeName } = options;
  
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSynced, setLastSynced] = useLocalStorage<string | null>(`lastSynced_${syncKey}`, null);
  
  const isOffline = useOfflineStatus();
  
  // Function to sync data from API to IndexedDB
  const syncData = useCallback(async () => {
    if (isOffline && !forceSync) return;
    
    setIsSyncing(true);
    setError(null);
    
    try {
      // Fetch data from API
      const apiData = await fetchFn();
      
      // Save to IndexedDB
      await clearStore(storeName);
      for (const item of apiData) {
        await putItem(storeName, item);
      }
      
      // Update state
      setData(apiData);
      setLastSynced(new Date().toISOString());
    } catch (err: any) {
      console.error(`Error syncing data for ${storeName}:`, err);
      setError(err.message || `Failed to sync data for ${storeName}`);
      
      // Try to load from IndexedDB as fallback
      try {
        const cachedData = await getAllItems<T>(storeName);
        setData(cachedData);
      } catch (cacheErr: any) {
        console.error(`Error loading cached data for ${storeName}:`, cacheErr);
      }
    } finally {
      setIsSyncing(false);
      setLoading(false);
    }
  }, [fetchFn, storeName, isOffline, forceSync, setLastSynced]);
  
  // Load data on component mount
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      
      try {
        // Try to load from IndexedDB first
        const cachedData = await getAllItems<T>(storeName);
        
        if (cachedData.length > 0) {
          setData(cachedData);
          setLoading(false);
          
          // Check if we need to sync
          const lastSyncedDate = lastSynced ? new Date(lastSynced) : null;
          const now = new Date();
          
          if (!lastSyncedDate || now.getTime() - lastSyncedDate.getTime() > syncInterval || forceSync) {
            // Sync in the background
            syncData();
          }
        } else {
          // No cached data, sync immediately
          await syncData();
        }
      } catch (err: any) {
        console.error(`Error loading data for ${storeName}:`, err);
        setError(err.message || `Failed to load data for ${storeName}`);
        setLoading(false);
        
        // Try to sync if error was from IndexedDB
        if (!isOffline) {
          syncData();
        }
      }
    };
    
    loadData();
  }, [storeName, syncData, lastSynced, syncInterval, forceSync, isOffline]);
  
  // Set up periodic sync
  useEffect(() => {
    if (isOffline) return;
    
    const intervalId = setInterval(() => {
      syncData();
    }, syncInterval);
    
    return () => clearInterval(intervalId);
  }, [syncData, syncInterval, isOffline]);
  
  return { 
    data, 
    loading, 
    error, 
    isSyncing, 
    lastSynced: lastSynced ? new Date(lastSynced) : null,
    syncData 
  };
}