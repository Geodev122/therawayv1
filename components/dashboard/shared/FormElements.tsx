
import React, { ChangeEvent, useState } from 'react';
import { InformationCircleIcon } from '../../icons';
import { useTranslation } from '../../../hooks/useTranslation'; // Import useTranslation

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  id: string;
  error?: string;
  containerClassName?: string;
  labelClassName?: string;
  inputClassName?: string;
  description?: string;
}

export const InputField: React.FC<InputProps> = ({
  label,
  id,
  error,
  containerClassName = 'mb-4',
  labelClassName = 'block text-sm font-medium text-gray-700 mb-1',
  inputClassName = 'mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-accent focus:border-accent sm:text-sm disabled:bg-gray-100 text-textOnLight bg-primary',
  description,
  ...props
}) => {
  const { direction } = useTranslation();
  return (
    <div className={containerClassName}>
      <label htmlFor={id} className={labelClassName}>
        {label}
        {props.required && <span className={`text-red-500 ${direction === 'rtl' ? 'mr-1' : 'ml-1'}`}>*</span>}
      </label>
      <input id={id} name={id} className={`${inputClassName} ${error ? 'border-red-500' : ''}`} {...props} />
      {description && <p className="mt-1 text-xs text-gray-500 flex items-center"><InformationCircleIcon className={`w-3 h-3 text-gray-400 ${direction === 'rtl' ? 'ml-1' : 'mr-1'}`}/>{description}</p>}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
};

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  id: string;
  error?: string;
  containerClassName?: string;
  labelClassName?: string;
  textareaClassName?: string;
  description?: string;
}

export const TextareaField: React.FC<TextareaProps> = ({
  label,
  id,
  error,
  containerClassName = 'mb-4',
  labelClassName = 'block text-sm font-medium text-gray-700 mb-1',
  textareaClassName = 'mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-accent focus:border-accent sm:text-sm disabled:bg-gray-100 text-textOnLight bg-primary',
  description,
  ...props
}) => {
  const { direction } = useTranslation();
  return (
    <div className={containerClassName}>
      <label htmlFor={id} className={labelClassName}>
        {label}
        {props.required && <span className={`text-red-500 ${direction === 'rtl' ? 'mr-1' : 'ml-1'}`}>*</span>}
      </label>
      <textarea id={id} name={id} className={`${textareaClassName} ${error ? 'border-red-500' : ''}`} {...props} />
      {description && <p className="mt-1 text-xs text-gray-500 flex items-center"><InformationCircleIcon className={`w-3 h-3 text-gray-400 ${direction === 'rtl' ? 'ml-1' : 'mr-1'}`}/>{description}</p>}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
};


interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  id: string;
  options: Array<{ value: string; label: string }>;
  error?: string;
  containerClassName?: string;
  labelClassName?: string;
  selectClassName?: string;
  description?: string;
  placeholder?: string;
}

export const SelectField: React.FC<SelectProps> = ({
  label,
  id,
  options,
  error,
  containerClassName = 'mb-4',
  labelClassName = 'block text-sm font-medium text-gray-700 mb-1',
  selectClassName = 'mt-1 block w-full px-3 py-2 border border-gray-300 bg-primary rounded-md shadow-sm focus:outline-none focus:ring-accent focus:border-accent sm:text-sm disabled:bg-gray-100 text-textOnLight',
  description,
  ...props
}) => {
  const { direction } = useTranslation();
  return (
    <div className={containerClassName}>
      <label htmlFor={id} className={labelClassName}>
        {label}
        {props.required && <span className={`text-red-500 ${direction === 'rtl' ? 'mr-1' : 'ml-1'}`}>*</span>}
      </label>
      <select id={id} name={id} className={`${selectClassName} ${error ? 'border-red-500' : ''}`} {...props}>
        {props.placeholder && <option value="">{props.placeholder}</option>}
        {options.map(option => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
      {description && <p className="mt-1 text-xs text-gray-500 flex items-center"><InformationCircleIcon className={`w-3 h-3 text-gray-400 ${direction === 'rtl' ? 'ml-1' : 'mr-1'}`}/>{description}</p>}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
};


interface FileUploadProps {
  label: string;
  id: string;
  currentFileUrl?: string | null; 
  onFileChange: (file: File | null) => void;
  accept?: string; 
  maxSizeMB?: number;
  description?: string;
  error?: string;
  required?: boolean;
}

export const FileUploadField: React.FC<FileUploadProps> = ({
  label,
  id,
  currentFileUrl,
  onFileChange,
  accept = "image/*",
  maxSizeMB = 5,
  description,
  error,
  required
}) => {
  const [fileName, setFileName] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(currentFileUrl || null);
  const [uploadError, setUploadError] = useState<string | null>(error || null);
  const { direction } = useTranslation();

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    setUploadError(null);
    const file = event.target.files?.[0];
    if (file) {
      if (file.size > maxSizeMB * 1024 * 1024) {
        setUploadError(`File is too large. Max size: ${maxSizeMB}MB.`); // This should be translated if it's user-facing
        setFileName(null);
        setPreviewUrl(currentFileUrl || null); 
        onFileChange(null);
        event.target.value = ""; 
        return;
      }
      setFileName(file.name);
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onloadend = () => {
          setPreviewUrl(reader.result as string);
        };
        reader.readAsDataURL(file);
      } else {
         setPreviewUrl(null); 
      }
      onFileChange(file);
    } else {
      setFileName(null);
      setPreviewUrl(currentFileUrl || null);
      onFileChange(null);
    }
  };
  
  const isImage = accept.includes("image");

  return (
    <div className="mb-4">
      <label htmlFor={id} className="block text-sm font-medium text-gray-700 mb-1">
        {label}
        {required && <span className={`text-red-500 ${direction === 'rtl' ? 'mr-1' : 'ml-1'}`}>*</span>}
      </label>
      <div className="mt-1 flex items-center space-x-4">
        {isImage && (previewUrl || currentFileUrl) && (
          <img 
            src={previewUrl || currentFileUrl || undefined} 
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
          <label
            htmlFor={id}
            className="cursor-pointer bg-primary py-2 px-3 border border-gray-300 rounded-md shadow-sm text-sm leading-4 font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-accent"
          >
            <span>{fileName ? 'Change file' : 'Upload file'}</span>
          </label>
          {fileName && <span className={`text-sm text-gray-500 truncate max-w-xs ${direction === 'rtl' ? 'mr-3' : 'ml-3'}`}>{fileName}</span>}
        </div>
      </div>
      {description && <p className="mt-1 text-xs text-gray-500 flex items-center"><InformationCircleIcon className={`w-3 h-3 text-gray-400 ${direction === 'rtl' ? 'ml-1' : 'mr-1'}`}/>{description}</p>}
      {(uploadError || error) && <p className="mt-1 text-xs text-red-600">{uploadError || error}</p>}
      {!fileName && currentFileUrl && !isImage && (
         <p className="mt-1 text-xs text-gray-500">Current file: <a href={currentFileUrl} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">{currentFileUrl.split('/').pop()}</a></p>
      )}
    </div>
  );
};

interface CheckboxProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  id: string;
  description?: string;
  error?: string; 
  containerClassName?: string; // Added prop
}

export const CheckboxField: React.FC<CheckboxProps> = ({
  label,
  id,
  description,
  error,
  containerClassName = 'mb-4', // Added default
  className = 'h-4 w-4 text-accent border-gray-300 rounded focus:ring-accent',
  ...props
}) => {
  const { direction } = useTranslation();
  return (
    <div className={containerClassName}> {/* Use the prop here */}
      <div className="flex items-start">
        <div className="flex items-center h-5">
          <input
            id={id}
            name={id}
            type="checkbox"
            className={className}
            {...props}
          />
        </div>
        <div className={`${direction === 'rtl' ? 'mr-3' : 'ml-3'} text-sm`}>
          <label htmlFor={id} className="font-medium text-gray-700">
            {label}
          </label>
          {description && <p className="text-gray-500 text-xs">{description}</p>}
        </div>
      </div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
};