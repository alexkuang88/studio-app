"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useAuth } from "@/lib/hooks/useAuth";
import { translations, type Locale } from "./translations";

interface LocaleContextType {
  locale: Locale;
  t: (key: string) => string;
  setLocale: (l: Locale) => void;
}

const LocaleContext = createContext<LocaleContextType>({
  locale: "zh",
  t: (key: string) => key,
  setLocale: () => {},
});

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("zh");
  const { profile, loading } = useAuth();

  useEffect(() => {
    if (!loading && profile?.language === "fr") {
      setLocaleState("fr");
    }
  }, [profile, loading]);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
  }, []);

  const t = useCallback(
    (key: string): string => {
      const dict = translations[locale];
      if (dict && key in dict) return dict[key as keyof typeof dict];
      const zhDict = translations.zh;
      if (zhDict && key in zhDict) return zhDict[key as keyof typeof zhDict];
      return key;
    },
    [locale]
  );

  return (
    <LocaleContext.Provider value={{ locale, t, setLocale }}>
      {children}
    </LocaleContext.Provider>
  );
}

export function useLocale() {
  return useContext(LocaleContext);
}
