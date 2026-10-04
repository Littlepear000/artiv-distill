import { createContext, ReactNode, useCallback, useContext, useMemo, useState } from "react";

export type Lang = "en" | "zh";

/**
 * 语言包：英文原文即 key，`i18n/zh/*.ts` 里每个文件导出 { "English text": "中文" }，
 * 这里自动合并。缺翻译时直接回退显示英文，所以新增页面不会因漏翻译而白屏。
 */
const modules = import.meta.glob<{ default: Record<string, string> }>("./zh/*.ts", { eager: true });
const zhDict: Record<string, string> = Object.assign({}, ...Object.values(modules).map((m) => m.default));

type Vars = Record<string, string | number>;
export type TFunction = (text: string, vars?: Vars) => string;

interface I18nValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: TFunction;
}

const I18nContext = createContext<I18nValue | undefined>(undefined);

function readInitialLang(): Lang {
  try {
    return localStorage.getItem("lang") === "zh" ? "zh" : "en"; // 默认英文
  } catch {
    return "en";
  }
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(readInitialLang);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    try {
      localStorage.setItem("lang", next);
    } catch {
      /* ignore */
    }
    document.documentElement.lang = next;
  }, []);

  const t = useCallback<TFunction>(
    (text, vars) => {
      let out = lang === "zh" ? zhDict[text] ?? text : text;
      if (vars) {
        for (const [k, v] of Object.entries(vars)) out = out.split(`{${k}}`).join(String(v));
      }
      return out;
    },
    [lang]
  );

  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}
