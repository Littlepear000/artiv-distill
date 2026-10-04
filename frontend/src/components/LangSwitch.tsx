import { useI18n } from "../i18n";

/** 右上角的 EN | 中文 切换。 */
export default function LangSwitch({ className = "" }: { className?: string }) {
  const { lang, setLang } = useI18n();
  const base = "px-2 py-0.5 text-xs";
  return (
    <div className={`inline-flex overflow-hidden rounded border border-slate-500 ${className}`} role="group" aria-label="Language">
      <button onClick={() => setLang("en")} className={`${base} ${lang === "en" ? "bg-white text-slate-800" : "text-slate-200 hover:bg-slate-600"}`}>
        EN
      </button>
      <button onClick={() => setLang("zh")} className={`${base} ${lang === "zh" ? "bg-white text-slate-800" : "text-slate-200 hover:bg-slate-600"}`}>
        中文
      </button>
    </div>
  );
}
