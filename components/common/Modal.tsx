import React from 'react';
import { XIcon } from '../icons';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | 'full'; 
}

export const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children, size = 'md' }) => {
  if (!isOpen) return null;

  const sizeClasses = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    '2xl': 'max-w-2xl',
    '3xl': 'max-w-3xl',
    full: 'max-w-full h-full sm:max-w-4xl md:max-w-5xl lg:max-w-6xl' 
  };

  return (
    <div 
        className="fixed inset-0 bg-background/70 backdrop-blur-sm flex justify-center items-center z-[1010] p-4 transition-opacity duration-300 ease-in-out" // Increased z-index
        onClick={onClose} 
    >
      <div
        className={`bg-primary rounded-xl shadow-2xl relative w-full ${sizeClasses[size]} transform transition-all duration-300 ease-in-out scale-95 opacity-0 animate-modalShow flex flex-col max-h-[90vh]`}
        onClick={(e) => e.stopPropagation()} 
        style={{ animationFillMode: 'forwards' }} 
      >
        <div className="flex items-center justify-between p-5 border-b border-gray-200">
            {title && <h2 className="text-xl font-semibold text-textOnLight">{title}</h2>}
            <button
            onClick={onClose}
            className="text-gray-400 hover:text-accent transition-colors p-1 rounded-full hover:bg-gray-100"
            aria-label="Close modal"
            >
            <XIcon className="w-5 h-5" />
            </button>
        </div>
        <div className="p-5 sm:p-6 overflow-y-auto flex-grow text-textOnLight">
            {children}
        </div>
      </div>
      {/* Styles moved to index.html global styles */}
    </div>
  );
};