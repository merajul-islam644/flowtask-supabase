import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/**
 * Runtime i18n, now fully local. The old build pulled dictionaries from the
 * Blocks Localization service; Supabase has no equivalent, so the language
 * list is static and `t()` resolves from local dictionaries (all call sites
 * pass an inline English fallback, which doubles as the base dictionary).
 * Adding a language = add a LanguageOption + a dictionary map below.
 */

const LANGUAGE_STORAGE_KEY = "flowtask.language";
const FALLBACK_LANGUAGE = "en-US";

export interface LanguageOption {
  code: string;
  name: string;
  isDefault: boolean;
}

interface I18nValue {
  language: string;
  languages: LanguageOption[];
  setLanguage: (code: string) => void;
  /** Dictionary lookup; falls back to `fallback`, then the key itself. */
  t: (key: string, fallback?: string) => string;
}

const LANGUAGES: LanguageOption[] = [
  { code: "en-US", name: "English", isDefault: true },
];

/**
 * Per-language dictionary overrides. Most call sites pass an inline English
 * fallback, but a few (Sidebar/Topbar) rely on the dictionary alone — these
 * entries cover every key that has no inline fallback.
 */
const DICTIONARIES: Record<string, Record<string, string>> = {
  "en-US": {
    "nav.overview": "Overview",
    "nav.projects": "Projects",
    "nav.tasks": "Tasks",
    "nav.calendar": "Calendar",
    "nav.settings": "Settings",
    "nav.help": "Help",
    "action.switchToDark": "Switch to dark mode",
    "action.switchToLight": "Switch to light mode",
    "action.profile": "Profile",
    "action.signingOut": "Signing out…",
    "action.logout": "Log out",
    "lang.label": "Language",
  },
};

const I18nContext = createContext<I18nValue | null>(null);

function storedLanguage(): string {
  try {
    return window.localStorage.getItem(LANGUAGE_STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

function persistLanguage(code: string) {
  try {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, code);
  } catch {
    // Private mode / blocked storage — the choice just won't persist.
  }
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState(() => {
    const saved = storedLanguage();
    return LANGUAGES.some((option) => option.code === saved) ? saved : FALLBACK_LANGUAGE;
  });

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const setLanguage = useCallback((code: string) => {
    setLanguageState(code);
    persistLanguage(code);
  }, []);

  const t = useCallback(
    (key: string, fallback?: string) => DICTIONARIES[language]?.[key] ?? fallback ?? key,
    [language],
  );

  const value = useMemo<I18nValue>(
    () => ({ language, languages: LANGUAGES, setLanguage, t }),
    [language, setLanguage, t],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const value = useContext(I18nContext);
  if (!value) throw new Error("useI18n must be used inside <I18nProvider>");
  return value;
}
