import { useState, useEffect } from 'react';

// Define the database name and version
const DB_NAME = 'theraWayOfflineDB';
const DB_VERSION = 1;

// Define the stores (tables) in our database
const STORES = {
  THERAPISTS: 'therapists',
  CLINICS: 'clinics',
  CLINIC_SPACES: 'clinicSpaces',
  FAVORITES: 'favorites',
  USER_DATA: 'userData'
};

// Initialize the database
const initDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onerror = (event) => {
      console.error('IndexedDB error:', event);
      reject('Error opening IndexedDB');
    };
    
    request.onsuccess = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      resolve(db);
    };
    
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      
      // Create object stores (tables)
      if (!db.objectStoreNames.contains(STORES.THERAPISTS)) {
        db.createObjectStore(STORES.THERAPISTS, { keyPath: 'id' });
      }
      
      if (!db.objectStoreNames.contains(STORES.CLINICS)) {
        db.createObjectStore(STORES.CLINICS, { keyPath: 'id' });
      }
      
      if (!db.objectStoreNames.contains(STORES.CLINIC_SPACES)) {
        const spaceStore = db.createObjectStore(STORES.CLINIC_SPACES, { keyPath: 'id' });
        spaceStore.createIndex('clinicId', 'clinicId', { unique: false });
      }
      
      if (!db.objectStoreNames.contains(STORES.FAVORITES)) {
        const favoritesStore = db.createObjectStore(STORES.FAVORITES, { keyPath: 'id' });
        favoritesStore.createIndex('clientId', 'clientId', { unique: false });
        favoritesStore.createIndex('therapistId', 'therapistId', { unique: false });
      }
      
      if (!db.objectStoreNames.contains(STORES.USER_DATA)) {
        db.createObjectStore(STORES.USER_DATA, { keyPath: 'id' });
      }
    };
  });
};

// Generic function to get all items from a store
export const getAllItems = async <T>(storeName: string): Promise<T[]> => {
  const db = await initDB();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readonly');
    const store = transaction.objectStore(storeName);
    const request = store.getAll();
    
    request.onerror = () => {
      reject(`Error getting items from ${storeName}`);
    };
    
    request.onsuccess = () => {
      resolve(request.result as T[]);
    };
  });
};

// Generic function to get an item by ID
export const getItemById = async <T>(storeName: string, id: string): Promise<T | null> => {
  const db = await initDB();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readonly');
    const store = transaction.objectStore(storeName);
    const request = store.get(id);
    
    request.onerror = () => {
      reject(`Error getting item from ${storeName}`);
    };
    
    request.onsuccess = () => {
      resolve(request.result as T || null);
    };
  });
};

// Generic function to add or update an item
export const putItem = async <T extends { id: string }>(storeName: string, item: T): Promise<void> => {
  const db = await initDB();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readwrite');
    const store = transaction.objectStore(storeName);
    const request = store.put(item);
    
    request.onerror = () => {
      reject(`Error putting item in ${storeName}`);
    };
    
    request.onsuccess = () => {
      resolve();
    };
  });
};

// Generic function to delete an item
export const deleteItem = async (storeName: string, id: string): Promise<void> => {
  const db = await initDB();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readwrite');
    const store = transaction.objectStore(storeName);
    const request = store.delete(id);
    
    request.onerror = () => {
      reject(`Error deleting item from ${storeName}`);
    };
    
    request.onsuccess = () => {
      resolve();
    };
  });
};

// Generic function to clear a store
export const clearStore = async (storeName: string): Promise<void> => {
  const db = await initDB();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readwrite');
    const store = transaction.objectStore(storeName);
    const request = store.clear();
    
    request.onerror = () => {
      reject(`Error clearing ${storeName}`);
    };
    
    request.onsuccess = () => {
      resolve();
    };
  });
};

// Hook to use IndexedDB with React
export function useIndexedDB<T extends { id: string }>(storeName: string, id?: string) {
  const [data, setData] = useState<T | T[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch data on component mount
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        
        if (id) {
          // Fetch single item
          const item = await getItemById<T>(storeName, id);
          setData(item);
        } else {
          // Fetch all items
          const items = await getAllItems<T>(storeName);
          setData(items);
        }
        
        setError(null);
      } catch (err: any) {
        console.error(`Error fetching from IndexedDB (${storeName}):`, err);
        setError(err.message || `Failed to fetch from IndexedDB (${storeName})`);
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
  }, [storeName, id]);

  // Function to save data
  const saveData = async (newData: T | T[]): Promise<void> => {
    try {
      if (Array.isArray(newData)) {
        // Save multiple items
        for (const item of newData) {
          await putItem<T>(storeName, item);
        }
      } else {
        // Save single item
        await putItem<T>(storeName, newData);
      }
      
      // Update state
      setData(newData);
    } catch (err: any) {
      console.error(`Error saving to IndexedDB (${storeName}):`, err);
      throw new Error(err.message || `Failed to save to IndexedDB (${storeName})`);
    }
  };

  // Function to delete data
  const deleteData = async (idToDelete: string): Promise<void> => {
    try {
      await deleteItem(storeName, idToDelete);
      
      // Update state
      if (Array.isArray(data)) {
        setData(data.filter(item => item.id !== idToDelete) as T[]);
      } else if (data && (data as T).id === idToDelete) {
        setData(null);
      }
    } catch (err: any) {
      console.error(`Error deleting from IndexedDB (${storeName}):`, err);
      throw new Error(err.message || `Failed to delete from IndexedDB (${storeName})`);
    }
  };

  return { data, loading, error, saveData, deleteData };
}

// Export store names for easy access
export const IndexedDBStores = STORES;