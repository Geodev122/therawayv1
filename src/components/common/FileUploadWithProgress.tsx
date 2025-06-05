import React, { useState } from 'react';
import { useFirebaseUpload } from '../../hooks/useFirebaseUpload';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from '../../hooks/useTranslation';
import { Button } from './Button';

interface FileUploadWithProgressProps {
  label: string;
  id: string;
  accept?: string;
  maxSizeMB?: number;
  fileType: string;
  onUploadComplete: (url: string) => void;
  currentFileUrl?: string | null;
  description?: string;
  required?: boolean;
}

export const FileUploadWithProgress: React.FC<FileUploadWithProgressProps> = ({
  label,
  id,
  accept = 'image/*',
  maxSizeMB = 5,
  fileType,
  onUploadComplete,
  currentFileUrl,
  description,
  required = false
}) => {
  const { t, direction } = useTranslation();
  const { user } = useAuth();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  
  const { upload, uploading, progress, error } = useFirebaseUpload({
    onSuccess: (url) => {
      onUploadComplete(url);
      setSelectedFile(null);
    }
  });
  
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    
    if (!file) {
      setSelectedFile(null);
      return;
    }
    
    // Check file size
    if (file.size > maxSizeMB * 1024 * 1024) {
      alert(t('fileTooLarge', { size: maxSizeMB, default: `File is too large. Maximum size is ${maxSizeMB}MB.` }));
      e.target.value = '';
      return;
    }
    
    setSelectedFile(file);
  };
  
  const handleUpload = async () => {
    if (!selectedFile || !user) return;
    
    await upload(selectedFile, user.id, fileType);
  };
  
  const isImage = accept.includes('image');
  
  return (
    <div className="mb-4">
      <label htmlFor={id} className="block text-sm font-medium text-gray-700 mb-1">
        {label}
        {required && <span className={`text-red-500 ${direction === 'rtl' ? 'mr-1' : 'ml-1'}`}>*</span>}
      </label>
      
      <div className="mt-1 flex items-center space-x-4">
        {isImage && (currentFileUrl || (selectedFile && !uploading)) && (
          <img 
            src={selectedFile ? URL.createObjectURL(selectedFile) : currentFileUrl || undefined} 
            alt="Preview" 
            className="h-20 w-20 rounded-md object-cover shadow-sm" 
          />
        )}
        
        <div className="flex-grow">
          <input
            id={id}
            name={id}
            type="file"
            accept={accept}
            onChange={handleFileChange}
            className="sr-only"
          />
          
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <label
              htmlFor={id}
              className="cursor-pointer bg-primary py-2 px-3 border border-gray-300 rounded-md shadow-sm text-sm leading-4 font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-accent"
            >
              <span>{selectedFile ? t('changeFile', { default: 'Change file' }) : t('selectFile', { default: 'Select file' })}</span>
            </label>
            
            {selectedFile && (
              <Button 
                variant="primary" 
                size="sm" 
                onClick={handleUpload} 
                disabled={uploading}
              >
                {uploading ? `${t('uploading', { default: 'Uploading...' })} (${progress}%)` : t('upload', { default: 'Upload' })}
              </Button>
            )}
          </div>
          
          {selectedFile && (
            <p className={`text-sm text-gray-500 truncate max-w-xs ${direction === 'rtl' ? 'mr-3' : 'ml-3'} mt-1`}>
              {selectedFile.name}
            </p>
          )}
        </div>
      </div>
      
      {description && (
        <p className="mt-1 text-xs text-gray-500">
          {description}
        </p>
      )}
      
      {error && (
        <p className="mt-1 text-xs text-red-600">
          {error}
        </p>
      )}
      
      {!selectedFile && currentFileUrl && !isImage && (
        <p className="mt-1 text-xs text-gray-500">
          {t('currentFile', { default: 'Current file:' })} 
          <a href={currentFileUrl} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline ml-1">
            {currentFileUrl.split('/').pop()}
          </a>
        </p>
      )}
      
      {uploading && (
        <div className="mt-2">
          <div className="w-full bg-gray-200 rounded-full h-2.5">
            <div className="bg-accent h-2.5 rounded-full" style={{ width: `${progress}%` }}></div>
          </div>
        </div>
      )}
    </div>
  );
};