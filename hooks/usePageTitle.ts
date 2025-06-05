
import { useEffect } from 'react';
import { useTranslation }  from './useTranslation';

export const usePageTitle = (titleKey: string, replacements?: Record<string, string | number>) => {
  const { t } = useTranslation();

  useEffect(() => {
    const newTitle = t(titleKey, replacements);
    document.title = newTitle;
  }, [t, titleKey, replacements]);
};
