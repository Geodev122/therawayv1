import { ref, uploadBytes, getDownloadURL, deleteObject, listAll } from 'firebase/storage';
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

// Delete a file from Firebase Storage
export const deleteFile = async (url: string): Promise<void> => {
  try {
    // Extract the path from the URL
    const decodedUrl = decodeURIComponent(url);
    const path = decodedUrl.split('?')[0].split('/o/')[1];
    
    if (!path) {
      throw new Error('Invalid file URL');
    }
    
    const storageRef = ref(storage, path);
    await deleteObject(storageRef);
  } catch (error: any) {
    console.error('Error deleting file:', error);
    throw new Error(error.message || 'Failed to delete file');
  }
};

// Generate a unique file path for uploads
export const generateFilePath = (userId: string, fileType: string, fileName: string): string => {
  const timestamp = new Date().getTime();
  const extension = fileName.split('.').pop() || '';
  const sanitizedFileName = fileName
    .split('.')[0]
    .replace(/[^a-z0-9]/gi, '_')
    .toLowerCase();
  
  return `${fileType}/${userId}/${sanitizedFileName}_${timestamp}.${extension}`;
};

// Upload profile picture
export const uploadProfilePicture = async (file: File, userId: string): Promise<string> => {
  const path = generateFilePath(userId, 'profile_pictures', file.name);
  return uploadFile(file, path);
};

// Upload intro video
export const uploadIntroVideo = async (file: File, userId: string): Promise<string> => {
  const path = generateFilePath(userId, 'intro_videos', file.name);
  return uploadFile(file, path);
};

// Upload certification file
export const uploadCertification = async (file: File, userId: string): Promise<string> => {
  const path = generateFilePath(userId, 'certifications', file.name);
  return uploadFile(file, path);
};

// Upload clinic photo
export const uploadClinicPhoto = async (file: File, clinicId: string): Promise<string> => {
  const path = generateFilePath(clinicId, 'clinic_photos', file.name);
  return uploadFile(file, path);
};

// Upload clinic space photo
export const uploadClinicSpacePhoto = async (file: File, spaceId: string): Promise<string> => {
  const path = generateFilePath(spaceId, 'space_photos', file.name);
  return uploadFile(file, path);
};

// Upload payment receipt
export const uploadPaymentReceipt = async (file: File, userId: string): Promise<string> => {
  const path = generateFilePath(userId, 'payment_receipts', file.name);
  return uploadFile(file, path);
};

// List all files in a directory
export const listFiles = async (path: string): Promise<string[]> => {
  try {
    const storageRef = ref(storage, path);
    const result = await listAll(storageRef);
    
    const urls = await Promise.all(
      result.items.map(async (itemRef) => {
        return await getDownloadURL(itemRef);
      })
    );
    
    return urls;
  } catch (error: any) {
    console.error('Error listing files:', error);
    throw new Error(error.message || 'Failed to list files');
  }
};