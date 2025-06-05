import { useState, useEffect } from 'react';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { firestore } from '../firebase/config';

interface UseFirestoreDocumentOptions {
  listen?: boolean; // Whether to listen for real-time updates
}

export function useFirestoreDocument<T>(
  collectionName: string,
  documentId: string | null | undefined,
  options: UseFirestoreDocumentOptions = {}
) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!documentId) {
      setData(null);
      setLoading(false);
      return;
    }
    
    setLoading(true);
    setError(null);
    
    if (options.listen) {
      // Set up real-time listener
      const unsubscribe = onSnapshot(
        doc(firestore, collectionName, documentId),
        (docSnapshot) => {
          if (docSnapshot.exists()) {
            setData({ id: docSnapshot.id, ...docSnapshot.data() } as T);
          } else {
            setData(null);
          }
          setLoading(false);
        },
        (err) => {
          console.error(`Error listening to ${collectionName}/${documentId}:`, err);
          setError(err.message || `Failed to listen to ${collectionName}/${documentId}`);
          setLoading(false);
        }
      );
      
      return () => unsubscribe();
    } else {
      // Fetch once
      const fetchData = async () => {
        try {
          const docRef = doc(firestore, collectionName, documentId);
          const docSnapshot = await getDoc(docRef);
          
          if (docSnapshot.exists()) {
            setData({ id: docSnapshot.id, ...docSnapshot.data() } as T);
          } else {
            setData(null);
          }
        } catch (err: any) {
          console.error(`Error fetching ${collectionName}/${documentId}:`, err);
          setError(err.message || `Failed to fetch ${collectionName}/${documentId}`);
        } finally {
          setLoading(false);
        }
      };
      
      fetchData();
    }
  }, [collectionName, documentId, options.listen]);

  return { data, loading, error };
}