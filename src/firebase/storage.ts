import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from './config';

// Upload a file to Firebase Storage
export const uploadFile = async (file: File, path: string): Promise<string> => {
  try {
    const storageRef = ref(storage, path);
    const snapshot = await uploadBytes(storageRef, file);
    const downloadURL = await getDownloadURL(snapshot.ref);
    return downloadURL;
  } catch (error: any) {
    console.error('Error uploading file:', error);
    throw new Error(error.message || 'Failed to upload file');
  }
};

// Generate a unique file path for uploads
export const generateFilePath = (userId: string, fileType: string, fileName: string): string => {
  const timestamp = new Date().getTime();
  const extension = fileName.split('.').pop();
  return `${fileType}/${userId}/${timestamp}.${extension}`;
};