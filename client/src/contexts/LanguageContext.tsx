import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import { translations } from "@/i18n/translations";

interface LanguageContextType {
  language: string;
  setLanguage: (lang: string) => void;
  t: (key: string, defaultValue?: string) => string;
  isRTL: boolean;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLangState] = useState(() => {
    return localStorage.getItem("civicpulse-lang") || "en";
  });

  const isRTL = language === "ar";

  useEffect(() => {
    localStorage.setItem("civicpulse-lang", language);
    document.documentElement.dir = isRTL ? "rtl" : "ltr";
    document.documentElement.lang = language;
  }, [language, isRTL]);

  const setLanguage = useCallback((lang: string) => {
    setLangState(lang);
  }, []);

  const t = useCallback((key: string, defaultValue?: string): string => {
    return translations[language]?.[key] || translations["en"]?.[key] || defaultValue || key;
  }, [language]);

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t, isRTL }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) throw new Error("useLanguage must be used within LanguageProvider");
  return context;
}
