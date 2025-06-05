
import { useLanguage } from '../contexts/LanguageContext';

export const useTranslation = () => {
  const { t, language, direction, setLanguage } = useLanguage();
  return { t, language, direction, setLanguage };
};
