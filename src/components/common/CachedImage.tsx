import React, { useState, useEffect } from 'react';

interface CachedImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  fallbackSrc?: string;
  loadingComponent?: React.ReactNode;
}

export const CachedImage: React.FC<CachedImageProps> = ({
  src,
  alt,
  fallbackSrc = 'https://via.placeholder.com/150?text=Image+Not+Available',
  loadingComponent,
  className,
  ...props
}) => {
  const [imgSrc, setImgSrc] = useState<string | undefined>(src);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);
  
  useEffect(() => {
    setImgSrc(src);
    setIsLoading(true);
    setError(false);
  }, [src]);
  
  const handleLoad = () => {
    setIsLoading(false);
    setError(false);
  };
  
  const handleError = () => {
    setIsLoading(false);
    setError(true);
    setImgSrc(fallbackSrc);
  };
  
  return (
    <>
      {isLoading && loadingComponent}
      <img
        src={imgSrc}
        alt={alt}
        className={`${className} ${isLoading ? 'hidden' : ''}`}
        onLoad={handleLoad}
        onError={handleError}
        {...props}
      />
    </>
  );
};