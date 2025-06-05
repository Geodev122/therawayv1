import { useState, useEffect } from 'react';
import { collection, query, where, orderBy, limit, getDocs, QueryConstraint } from 'firebase/firestore';
import { firestore } from '../firebase/config';

interface UseFirestoreCollectionOptions {
  whereConditions?: [string, any, any][];
  orderByField?: string;
  orderDirection?: 'asc' | 'desc';
  limitCount?: number;
}

export function useFirestoreCollection<T>(
  collectionName: string,
  options: UseFirestoreCollectionOptions = {}
) {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      
      try {
        const constraints: QueryConstraint[] = [];
        
        // Add where conditions
        if (options.whereConditions) {
          options.whereConditions.forEach(([field, operator, value]) => {
            constraints.push(where(field, operator, value));
          });
        }
        
        // Add orderBy
        if (options.orderByField) {
          constraints.push(orderBy(options.orderByField, options.orderDirection || 'asc'));
        }
        
        // Add limit
        if (options.limitCount) {
          constraints.push(limit(options.limitCount));
        }
        
        const q = query(collection(firestore, collectionName), ...constraints);
        const querySnapshot = await getDocs(q);
        
        const items: T[] = [];
        querySnapshot.forEach((doc) => {
          items.push({ id: doc.id, ...doc.data() } as T);
        });
        
        setData(items);
      } catch (err: any) {
        console.error(`Error fetching ${collectionName}:`, err);
        setError(err.message || `Failed to fetch ${collectionName}`);
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
  }, [collectionName, JSON.stringify(options)]);

  return { data, loading, error };
}