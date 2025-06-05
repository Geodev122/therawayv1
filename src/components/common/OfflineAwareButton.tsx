import React from 'react';
import { Button } from './Button';
import { useOfflineStatus } from '../../hooks/useOfflineStatus';

interface OfflineAwareButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'light' | 'link';
  size?: 'sm' | 'md' | 'lg';
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  isFullWidth?: boolean;
  offlineDisabled?: boolean;
  offlineTooltip?: string;
}

export const OfflineAwareButton: React.FC<OfflineAwareButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  leftIcon,
  rightIcon,
  className = '',
  isFullWidth = false,
  offlineDisabled = true,
  offlineTooltip = 'This action is not available while offline',
  ...props
}) => {
  const isOffline = useOfflineStatus();
  const isDisabled = props.disabled || (isOffline && offlineDisabled);
  
  return (
    <div className="relative inline-block">
      <Button
        variant={variant}
        size={size}
        leftIcon={leftIcon}
        rightIcon={rightIcon}
        className={className}
        isFullWidth={isFullWidth}
        {...props}
        disabled={isDisabled}
      >
        {children}
      </Button>
      {isOffline && offlineDisabled && (
        <div className="absolute -top-10 left-1/2 transform -translate-x-1/2 bg-gray-800 text-white text-xs rounded py-1 px-2 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          {offlineTooltip}
        </div>
      )}
    </div>
  );
};