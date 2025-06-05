import { useState, useCallback } from 'react';
import { useOfflineStatus } from './useOfflineStatus';
import { putItem, getItemById, getAllItems } from './useIndexedDB';

interface UseOfflineAwareAPIOptions {
  cacheKey?: string;
  cacheTTL?: number; // Time to live in milliseconds
}

export function useOfflineAwareAPI<T>(options: UseOfflineAwareAPIOptions = {}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isOffline = useOfflineStatus();
  
  const { cacheKey, cacheTTL = 5 * 60 * 1000 } = options; // Default TTL: 5 minutes
  
  const fetchData = useCallback(async <R>(
    url: string,
    config: RequestInit = {},
    cacheStore?: string
  ): Promise<R> => {
    setLoading(true);
    setError(null);
    
    const cacheId = cacheKey || url;
    
    try {
      if (isOffline) {
        // Try to get from cache if offline
        if (cacheStore) {
          const cachedData = await getItemById<{ data: R; timestamp: number }>(cacheStore, cacheId);
          
          if (cachedData) {
            // Check if cache is still valid
            const now = Date.now();
            if (now - cachedData.timestamp < cacheTTL) {
              setLoading(false);
              return cachedData.data;
            }
          }
        }
        
        throw new Error('You are offline and no cached data is available');
      }
      
      // Online: fetch from network
      const response = await fetch(url, config);
      
      if (!response.ok) {
        throw new Error(`API error: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      
      // Cache the result if a store is provided
      if (cacheStore) {
        await putItem(cacheStore, {
          id: cacheId,
          data,
          timestamp: Date.now()
        });
      }
      
      setLoading(false);
      return data;
    } catch (err: any) {
      console.error('API error:', err);
      setError(err.message || 'An unexpected error occurred');
      setLoading(false);
      throw err;
    }
  }, [isOffline, cacheKey, cacheTTL]);
  
  return { fetchData, loading, error, isOffline };
}