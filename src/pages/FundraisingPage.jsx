// src/components/pages/FundraisingPage.jsx
import { For, Show, createMemo, createResource, createSignal } from "solid-js";
import { useApp } from "../context/AppContext.jsx";
import { useHashRouter, navigate } from "../routing/hashRouter.js";
import ClosePageButton from "../components/ui/ClosePageButton.jsx";
import UserCard from "../components/ui/UserCard.jsx";
import TokenValue from "../components/ui/TokenValue.jsx";
import Spinner from "../components/ui/Spinner.jsx";
import ProgressBar from "../components/ui/ProgressBar.jsx";
import { whenWsOpen } from "../net/wsRuntime.js";
import { toChecksumAddress } from "../blockchain/utils.js";

const DEFAULT_LIMIT = 20;

function toWeiBigInt(value) {
  // Accept bigint | decimal-string | number (including 1e+21, 7.76e+21)
  if (typeof value === "bigint") return value;
  if (typeof value === "string") {
    // If it's a plain integer string
    if (/^\d+$/.test(value)) return BigInt(value);
    // If it’s scientific "7.76e+21"
    const m = value.match(/^(\d+)(?:\.(\d+))?e([+-]?\d+)$/i);
    if (m) {
      const int = m[1] || "0";
      const frac = m[2] || "";
      const exp = parseInt(m[3], 10);
      if (exp >= 0) {
        const digits = int + frac;
        const shift = exp - frac.length;
        return BigInt(shift >= 0 ? digits + "0".repeat(shift) : digits.slice(0, digits.length + shift) || "0");
      }
      // negative exponent → <1 wei → 0
      return 0n;
    }
    // Fallback: strip non-digits; safest return 0n if unsure
    const cleaned = value.replace(/\D/g, "");
    return cleaned ? BigInt(cleaned) : 0n;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    // Prefer parsing via the number’s scientific notation string
    const s = value.toString();
    if (/e/i.test(s)) return toWeiBigInt(s);
    if (Number.isInteger(value)) return BigInt(value);
    return 0n; // not expected for wei; be safe
  }
  return 0n;
}

function percentOf(raisedWei, targetWei) {
  const r = toWeiBigInt(raisedWei);
  const t = toWeiBigInt(targetWei);
  if (t <= 0n) return 0;
  // Keep two fractional digits using integer math
  const p100 = (r * 10000n) / t; // → percent * 100
  return Number(p100) / 100;
}

export default function FundraisingPage() {
  const app = useApp();
  const { t } = app;
  const { route } = useHashRouter();

  const [onlyMy, setOnlyMy] = createSignal(true);
  const [page, setPage] = createSignal(1);
  const [limit] = createSignal(DEFAULT_LIMIT);

  const wsList = createMemo(() => app.wsMethod ? app.wsMethod("list-fundraisers") : null);
  const userAddr = createMemo(() => app.authorizedUser()?.address || "");

  const params = createMemo(() => ({
    page: page(),
    limit: limit(),
    onlyMy: onlyMy(),
    user: userAddr(),
  }));

  const [data] = createResource(params, async (p) => {
    if (!wsList()) return { list: [], hasMore: false };
    await whenWsOpen();
    const offset = (p.page - 1) * p.limit;
    const req = { id: 0, limit: p.limit, offset };
    if (p.onlyMy && p.user) req.user = toChecksumAddress(p.user);
    const res = await wsList()(req);
    const list = Array.isArray(res) ? res : Array.isArray(res?.list) ? res.list : [];
    return { list, hasMore: list.length === p.limit };
  });

  const list = () => data()?.list || [];
  const hasMore = () => !!data()?.hasMore;

  function goCreate() {
    // Editor already handles /editor/new; param is harmless if not used yet
    navigate("/editor/new?fundraiser=1");
  }

  function toggleOnlyMy(e) {
    setOnlyMy(e.currentTarget.checked);
    setPage(1);
  }

  const showLoginHint = createMemo(() => onlyMy() && !userAddr());

  return (
    <main class="p-4 max-w-6xl mx-auto space-y-4">
      <ClosePageButton />
      <div class="flex items-center justify-between">
        <h2 class="text-2xl font-semibold">{t("fundraising.title")}</h2>
        <button
          type="button"
          class="px-3 py-2 rounded-md bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90"
          onClick={goCreate}
          title={t("fundraising.create")}
        >
          {t("fundraising.create")}
        </button>
      </div>

      <div class="flex items-center gap-4">
        <label class="inline-flex items-center gap-2 text-sm">
          <input type="checkbox" checked={onlyMy()} onInput={toggleOnlyMy} />
          <span>{t("fundraising.onlyMy")}</span>
        </label>
        <Show when={showLoginHint()}>
          <div class="text-xs text-[hsl(var(--muted-foreground))]">
            {t("fundraising.loginHint")}
          </div>
        </Show>
      </div>

      <div class="rounded-lg border border-[hsl(var(--border))] overflow-hidden">
        <div class="overflow-x-auto">
          <table class="min-w-full text-sm">
            <thead class="bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]">
              <tr>
                <th class="px-3 py-2 text-left w-16">{t("fundraising.th.id")}</th>
                <th class="px-3 py-2 text-left">{t("fundraising.th.receiver")}</th>
                <th class="px-3 py-2 text-right w-40">{t("fundraising.th.target")}</th>
                <th class="px-3 py-2 text-right w-40">{t("fundraising.th.raised")}</th>
                <th class="px-3 py-2 text-left w-[220px]">{t("fundraising.th.progress")}</th>
              </tr>
            </thead>

            <tbody>
              <Show when={!data.loading} fallback={
                <tr><td colSpan="5" class="py-8 text-center"><Spinner /></td></tr>
              }>
                <Show when={list().length > 0} fallback={
                  <tr>
                    <td colSpan="5" class="px-3 py-6 text-center text-[hsl(var(--muted-foreground))]">
                      {t("fundraising.empty")}
                    </td>
                  </tr>
                }>
                  <For each={list()}>{(it) => {
                    const id = () => it?.id;
                    const targetWei = () => toWeiBigInt(it?.target_amount);
                    const raisedWei = () => toWeiBigInt(it?.raised);
                    const pct = () => percentOf(raisedWei(), targetWei());
                    return (
                      <tr class="border-t border-[hsl(var(--border))]">
                        <td class="px-3 py-2 align-top font-mono">{id()}</td>
                        <td class="px-3 py-2 align-top">
                          <UserCard author={it?.user} compact={true} />
                          <Show when={it?.title}>
                            <div class="text-xs text-[hsl(var(--muted-foreground))] line-clamp-2 mt-1">
                              {it.title}
                            </div>
                          </Show>
                        </td>
                        <td class="px-3 py-2 align-top text-right">
                          <TokenValue amount={targetWei()} format="vertical" />
                        </td>
                        <td class="px-3 py-2 align-top text-right">
                          <TokenValue amount={raisedWei()} format="vertical" />
                        </td>
                        <td class="px-3 py-2 align-top">
                          <div class="flex items-center gap-2">
                            <div class="min-w-[140px]">
                              <ProgressBar value={pct()} />
                            </div>
                            <div class="text-xs w-14 tabular-nums">
                              {pct().toFixed(1)}%
                            </div>
                          </div>
                        </td>
                      </tr>
                    );
                  }}</For>
                </Show>
              </Show>
            </tbody>
          </table>
        </div>

        <Show when={!data.loading && (list().length > 0)}>
          <div class="flex items-center justify-between p-3 border-t border-[hsl(var(--border))]">
            <button
              class="px-3 py-1.5 rounded border border-[hsl(var(--border))] hover:bg-[hsl(var(--accent))]"
              disabled={page() <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              type="button"
            >
              {t("fundraising.prev")}
            </button>
            <div class="text-xs text-[hsl(var(--muted-foreground))]">
              {t("fundraising.pageX", { page: page() })}
            </div>
            <button
              class="px-3 py-1.5 rounded border border-[hsl(var(--border))] hover:bg-[hsl(var(--accent))]"
              disabled={!hasMore()}
              onClick={() => setPage((p) => p + 1)}
              type="button"
            >
              {t("fundraising.next")}
            </button>
          </div>
        </Show>
      </div>
    </main>
  );
}
