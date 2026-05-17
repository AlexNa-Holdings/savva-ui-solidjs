// src/x/pages/admin/LogsPage.jsx
import { createSignal, createMemo, onMount, For } from "solid-js";
import { useApp } from "../../../context/AppContext.jsx";
import { httpBase } from "../../../net/endpoints.js";
import { pushErrorToast } from "../../../ui/toast.js";

const DEFAULT_LINES = 200;
const MIN_LINES = 1;
const MAX_LINES = 10000;

const LEVEL_RE = /^(.*?:\s)(TRC|DBG|INF|WRN|ERR|FTL|PNC|FAT)(\s+.*)$/;

const LEVEL_CLASS = {
  TRC: "text-zinc-500",
  DBG: "text-sky-400",
  INF: "text-emerald-400",
  WRN: "text-amber-400 font-semibold",
  ERR: "text-red-400 font-semibold",
  FTL: "text-red-500 font-bold",
  PNC: "text-red-500 font-bold",
  FAT: "text-red-500 font-bold",
};

const ROW_CLASS = {
  WRN: "bg-amber-500/5",
  ERR: "bg-red-500/10",
  FTL: "bg-red-500/20",
  PNC: "bg-red-500/20",
  FAT: "bg-red-500/20",
};

export default function LogsPage() {
  const app = useApp();
  const { t } = app;

  const [lines, setLines] = createSignal(DEFAULT_LINES);
  const [content, setContent] = createSignal("");
  const [loading, setLoading] = createSignal(false);
  const [errorsOnly, setErrorsOnly] = createSignal(false);

  const ERROR_LEVELS = new Set(["ERR", "FTL", "PNC", "FAT"]);
  const BANNER_RE = /^\s*(-{10,}|SAVVA Backend\. v:)/;

  const parsedRows = createMemo(() => {
    const text = content();
    if (!text) return [];
    const rows = text.split("\n").map((raw) => {
      const m = raw.match(LEVEL_RE);
      if (!m) return { raw, level: null, banner: false };
      const banner = BANNER_RE.test(m[3]);
      return { raw, prefix: m[1], level: m[2], rest: m[3], banner };
    });
    return errorsOnly() ? rows.filter((r) => ERROR_LEVELS.has(r.level) || r.banner) : rows;
  });

  const clamp = (n) => {
    const v = Number.isFinite(n) ? Math.floor(n) : DEFAULT_LINES;
    return Math.min(MAX_LINES, Math.max(MIN_LINES, v));
  };

  const fetchLog = async () => {
    if (loading()) return;
    setLoading(true);
    try {
      const n = clamp(lines());
      const url = `${httpBase()}get-log?n=${encodeURIComponent(n)}`;
      const res = await fetch(url, { credentials: "include", cache: "no-store" });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const text = await res.text();
      setContent(text);
    } catch (e) {
      pushErrorToast(e, { context: t("admin.logs.error") });
    } finally {
      setLoading(false);
    }
  };

  onMount(() => { fetchLog(); });

  return (
    <div class="p-4">
      <h3 class="text-xl font-semibold mb-2">{t("admin.logs.title")}</h3>
      <p class="text-sm text-[hsl(var(--muted-foreground))] mb-4">
        {t("admin.logs.description")}
      </p>

      <div class="flex items-end gap-3 mb-3">
        <div>
          <label class="block text-sm mb-1 opacity-80">
            {t("admin.logs.linesLabel")}
          </label>
          <input
            type="number"
            min={MIN_LINES}
            max={MAX_LINES}
            class="w-32 rounded-xl border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3 py-2 outline-none"
            value={lines()}
            onInput={(e) => setLines(Number(e.currentTarget.value))}
            disabled={loading()}
          />
        </div>
        <button
          type="button"
          class="px-4 py-2 rounded-md bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed"
          onClick={fetchLog}
          disabled={loading()}
        >
          {loading() ? t("common.working") : t("admin.logs.refresh")}
        </button>
        <label class="flex items-center gap-2 select-none cursor-pointer pb-2">
          <input
            type="checkbox"
            class="h-4 w-4 cursor-pointer"
            checked={errorsOnly()}
            onChange={(e) => setErrorsOnly(e.currentTarget.checked)}
          />
          <span class="text-sm">{t("admin.logs.errorsOnly")}</span>
        </label>
      </div>

      <div class="w-full max-h-[60vh] overflow-auto rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted))] p-3 text-xs font-mono">
        {parsedRows().length === 0 ? (
          <span class="opacity-60">{loading() ? "" : t("admin.logs.empty")}</span>
        ) : (
          <For each={parsedRows()}>
            {(row) => (
              <div class={`whitespace-pre-wrap break-words leading-5 px-1 ${row.banner ? "bg-fuchsia-500/15 font-semibold" : row.level ? ROW_CLASS[row.level] || "" : ""}`}>
                {row.level ? (
                  <>
                    <span class="opacity-60">{row.prefix}</span>
                    <span class={LEVEL_CLASS[row.level] || ""}>{row.level}</span>
                    <span>{row.rest}</span>
                  </>
                ) : (
                  row.raw || " "
                )}
              </div>
            )}
          </For>
        )}
      </div>
    </div>
  );
}
