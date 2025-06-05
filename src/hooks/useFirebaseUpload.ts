import { useState, useCallback } from 'react';
import { useOfflineStatus } from './useOfflineStatus';
import { uploadFile, generateFilePath } from '../firebase/storage';

interface UseFirebaseUploadOptions {
  path?: string;
  onSuccess?: (url: string) => void;
  onError?: (error: Error) => void;
}

export function useFirebaseUpload(options: UseFirebaseUploadOptions = {}) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  
  const isOffline = useOfflineStatus();
  
  const upload = useCallback(async (file: File, userId: string, fileType: string) => {
    if (isOffline) {
      const error = new Error('Cannot upload files while offline');
      setError(error.message);
      if (options.onError) options.onError(error);
      return null;
    }
    
    setUploading(true);
    setProgress(0);
    setError(null);
    
    try {
      // Generate file path
      const path = options.path || generateFilePath(userId, fileType, file.name);
      
      // TODO: Implement progress tracking
      // For now, we'll just set progress to 50% immediately
      setProgress(50);
      
      // Upload file
      const downloadUrl = await uploadFile(file, path);
      
      setUrl(downloadUrl);
      setProgress(100);
      
      if (options.onSuccess) options.onSuccess(downloadUrl);
      
      return downloadUrl;
    } catch (err: any) {
      console.error('Upload error:', err);
      setError(err.message || 'Failed to upload file');
      
      if (options.onError) options.onError(err);
      
      return null;
    } finally {
      setUploading(false);
    }
  }, [isOffline, options]);
  
  return { upload, uploading, progress, error, url };
}