
import React, { createContext, useState, useContext, ReactNode, useEffect, useCallback } from 'react';

type Language = 'en' | 'ar';
type Direction = 'ltr' | 'rtl';

interface LanguageContextType {
  language: Language;
  direction: Direction;
  setLanguage: (language: Language) => void;
  t: (key: string, replacements?: Record<string, string | number>) => string; // Add t function
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

const translations: Record<Language, Record<string, string>> = {
  en: {},
  ar: {}
};

const LOCALE_FETCH_TIMEOUT_MS = 7000; // 7 seconds timeout for fetching locale files

async function loadTranslations(lang: Language) {
  console.log(`LanguageContext: Attempting to fetch locales/${lang}.json`);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
      console.warn(`LanguageContext: Fetch for locales/${lang}.json timed out after ${LOCALE_FETCH_TIMEOUT_MS}ms.`);
      controller.abort();
  }, LOCALE_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(`locales/${lang}.json`, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text().catch(() => `Could not read error response text for ${lang}.json.`);
      console.error(`LanguageContext: Failed to load ${lang}.json. Status: ${response.status}. URL: ${response.url}. Response: ${errorText}`);
      translations[lang] = {}; // Fallback
      return; 
    }
    try {
        translations[lang] = await response.json();
        console.log(`LanguageContext: Successfully loaded and parsed translations for ${lang}.`);
    } catch (parseError) {
        const responseText = await response.text().catch(() => `Could not read response text for ${lang}.json after parse failure.`);
        console.error(`LanguageContext: Failed to parse JSON from ${lang}.json:`, parseError, `\nResponse text was:\n${responseText.substring(0, 500)}...`);
        translations[lang] = {}; // Fallback
    }
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
        // Timeout message already logged
    } else {
        console.error(`LanguageContext: Network or other error loading translations for ${lang}:`, error);
    }
    translations[lang] = {}; // Fallback
  }
}


export const LanguageProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [language, setCurrentLanguage] = useState<Language>(() => {
    const storedLang = localStorage.getItem('theraWayLanguage') as Language | null;
    return storedLang || 'en';
  });
  const [isLoaded, setIsLoaded] = useState(false);

  const direction = language === 'ar' ? 'rtl' : 'ltr';

  useEffect(() => {
    const loadInitialTranslations = async () => {
      console.log("LanguageProvider: Starting to load initial translations...");
      // Ensure that Promise.all still resolves even if one of the loads fails internally
      // by making loadTranslations itself always resolve (which it now does).
      await Promise.all([loadTranslations('en'), loadTranslations('ar')]);
      setIsLoaded(true); 
      console.log("LanguageProvider: Finished loading initial translations. isLoaded:", true);
    };
    loadInitialTranslations();
  }, []);

  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = direction;
    localStorage.setItem('theraWayLanguage', language);
  }, [language, direction]);

  const setLanguage = (lang: Language) => {
    setCurrentLanguage(lang);
  };

  const t = useCallback((key: string, replacements?: Record<string, string | number>): string => {
    if (!isLoaded) {
      // console.warn(`LanguageContext: Translations not yet fully loaded. Returning key: "${key}"`);
      return key; 
    }

    let translation = translations[language]?.[key] || translations['en']?.[key] || key;
    
    if (replacements) {
      Object.entries(replacements).forEach(([placeholder, value]) => {
        translation = translation.replace(new RegExp(`{${placeholder}}`, 'g'), String(value));
      });
    }
    return translation;
  }, [language, isLoaded]);

  if (!isLoaded) {
    // console.log("LanguageProvider: Rendering loader because 'isLoaded' is false."); // Reduced console noise
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-accent" title="Loading application resources..."></div>
      </div>
    );
  }
  // console.log("LanguageProvider: Rendering children because 'isLoaded' is true."); // Reduced console noise
  return (
    <LanguageContext.Provider value={{ language, direction, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = (): LanguageContextType => {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};
