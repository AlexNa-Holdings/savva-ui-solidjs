// src/x/promote/PromoteAnnounceTab.jsx
import { Show, For, createMemo, createResource, createSignal } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";
import { loadAssetResource } from "../../utils/assetLoader.js";
import Spinner from "../ui/Spinner.jsx";
import { getSavvaContract } from "../../blockchain/contracts.js";
import TokenValue from "../ui/TokenValue.jsx";
import { pushToast } from "../../ui/toast.js";
import { sendAsActor } from "../../blockchain/npoMulticall.js";
import { dbg } from "../../utils/debug.js";

function getLocalizedTitle(titleData, currentLang) {
  if (!titleData || typeof titleData !== "object") return "";
  if (titleData[currentLang]) return titleData[currentLang];
  if (titleData["*"]) return titleData["*"];
  if (titleData.en) return titleData.en;
  const k = Object.keys(titleData)[0];
  return k ? titleData[k] : "";
}

function resolveSavvaCid(post) {
  return (
    post?.savva_cid ??
    post?.savvaCid ??
    post?.cid ??
    post?.content_cid ??
    post?.ipfs_cid ??
    post?.params?.cid ??
    post?.publishedData?.rootCid ??
    post?.publishedData?.cid ??
    ""
  );
}

async function readListMarketPrice(app, listId) {
  try {
    const lm = await getSavvaContract(app, "ListMarket");
    const out = await lm.read.getPrice([String(listId)]);
    return typeof out === "bigint" ? out : BigInt(out ?? 0);
  } catch (e) {
    dbg.warn?.("PromoteAnnounceTab:getPrice failed", e?.message);
    return 0n;
  }
}

export default function PromoteAnnounceTab(props) {
  const app = useApp();
  const post = () => props.post || null;

  const actorAddr = () => app.actorAddress?.() || app.authorizedUser?.()?.address || "";
  const hasActor = createMemo(() => !!actorAddr());

  const modulePath = createMemo(() => app.domainAssetsConfig?.()?.modules?.content_lists);
  const currentLang = createMemo(() => (app.lang?.() || "en").toLowerCase());

  // Robust domain resolver: tries multiple AppContext sources
  const activeDomain = createMemo(() => {
    const candidates = [
      typeof app.domain === "function" ? app.domain() : app.domain,
      app.info?.()?.domain,
      app.config?.()?.domain,
      app.params?.()?.domain,
    ];
    const found = candidates.find((d) => typeof d === "string" && d.trim().length > 0);
    return String(found || "").trim();
  });

  const [contentListModule] = createResource(modulePath, async (path) => {
    if (!path || typeof path !== "string") return null;
    try {
      return await loadAssetResource(app, path, { type: "yaml" });
    } catch {
      return null;
    }
  });

  const listsObj = createMemo(() => {
    const cfg = app.domainAssetsConfig?.() || {};
    const mod = cfg?.modules?.content_lists;
    if (typeof mod === "string") {
      const data = contentListModule();
      if (data && typeof data === "object") return data.list && typeof data.list === "object" ? data.list : data;
    } else if (mod && typeof mod === "object") {
      return mod.list && typeof mod.list === "object" ? mod.list : mod;
    }
    if (cfg?.content_lists?.list) return cfg.content_lists.list;
    if (cfg?.content_lists && typeof cfg.content_lists === "object") return cfg.content_lists;
    return null;
  });

  const listDefs = createMemo(() => {
    const obj = listsObj();
    if (!obj || typeof obj !== "object") return [];
    const seen = new Set();
    const out = [];
    for (const [id, data] of Object.entries(obj)) {
      if (seen.has(id)) continue;
      seen.add(id);
      out.push({ id, title: getLocalizedTitle(data?.title || {}, currentLang()) });
    }
    return out;
  });

  const [pricedLists] = createResource(
    () => ({ app, lists: listDefs() }),
    async ({ app, lists }) => {
      if (!Array.isArray(lists) || lists.length === 0) return [];
      const results = await Promise.all(
        lists.map(async (it) => {
          const price = await readListMarketPrice(app, it.id);
          return { ...it, price };
        })
      );
      const filtered = results.filter((r) => r.price !== 0n);
      dbg.log("PromoteAnnounceTab:prices", filtered.map((r) => ({ id: r.id, wei: r.price.toString() })));
      return filtered;
    }
  );

  const [pending, setPending] = createSignal(new Set());
  const isPending = (id) => pending().has(id);
  const setRowPending = (id, on) => {
    const s = new Set(pending());
    on ? s.add(id) : s.delete(id);
    setPending(s);
  };

  async function handleBuy(row) {
    const domain = activeDomain();
    const cid = resolveSavvaCid(post());

    if (!hasActor()) {
      pushToast({ type: "warning", message: app.t("wallet.connectPrompt") });
      return;
    }
    if (!domain) {
      pushToast({ type: "warning", message: app.t("promote.announce.domainMissing") });
      return;
    }
    if (!cid) {
      pushToast({ type: "danger", message: app.t("promote.error.noCid") });
      return;
    }

    setRowPending(row.id, true);
    try {
      const res = await sendAsActor(app, {
        contractName: "ListMarket",
        functionName: "buy",
        args: [domain, String(row.id), String(cid)],
        value: row.price,
      });
      const txHash = res?.hash || res;
      dbg.log("PromoteAnnounceTab:buy", { hash: txHash, list: row.id, price: row.price.toString(), domain, cid });
      pushToast({
        type: "success",
        message: app.t("promote.buySubmitted"),
        details: txHash ? { hash: txHash } : undefined,
        autohideMs: 6000,
      });
      try {
        window.dispatchEvent(new CustomEvent("savva:promote:after-buy", { detail: { list_id: row.id, txHash, domain, cid } }));
      } catch {}
    } catch (e) {
      dbg.error?.("PromoteAnnounceTab:buy failed", e);
      pushToast({
        type: "danger",
        message: app.t("promote.buyFailed"),
        details: { message: e?.shortMessage || e?.message || String(e) },
        autohideMs: 9000,
      });
    } finally {
      setRowPending(row.id, false);
    }
  }

  return (
    <div class="bg-[hsl(var(--background))] rounded-b-xl p-4 space-y-4">
      <p class="text-sm text-[hsl(var(--muted-foreground))]">
        {app.t("promote.announce.intro")}
      </p>

      <Show when={!hasActor()}>
        <div class="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-3 text-sm">
          {app.t("wallet.connectPrompt")}
        </div>
      </Show>

      <Show when={pricedLists.loading}>
        <div class="flex justify-center py-10">
          <Spinner />
        </div>
      </Show>

      <Show when={!pricedLists.loading && Array.isArray(pricedLists()) && pricedLists().length === 0}>
        <div class="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-3 text-sm">
          {app.t("promote.announce.noPaidLists")}
        </div>
      </Show>

      <Show when={!pricedLists.loading && Array.isArray(pricedLists()) && pricedLists().length > 0}>
        <div class="overflow-x-auto rounded-lg border border-[hsl(var(--border))]">
          <table class="w-full text-sm">
            <thead class="bg-[hsl(var(--muted))]">
              <tr class="text-left">
                <th class="px-3 py-2 w-40">{app.t("promote.table.id")}</th>
                <th class="px-3 py-2">{app.t("promote.table.title")}</th>
                <th class="px-3 py-2 w-40">{app.t("promote.table.price")}</th>
                <th class="px-3 py-2 w-36 text-right">{app.t("promote.table.actions")}</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-[hsl(var(--border))] bg-[hsl(var(--card))]">
              <For each={pricedLists()}>
                {(row) => (
                  <tr>
                    <td class="px-3 py-2 font-mono text-xs">{row.id}</td>
                    <td class="px-3 py-2">{row.title || row.id}</td>
                    <td class="px-3 py-2">
                      <TokenValue amount={row.price} tokenAddress="0" format="vertical" class="font-medium tabular-nums" />
                    </td>
                    <td class="px-3 py-2 text-right">
                      <button
                        class={`px-3 py-1.5 rounded-lg text-[hsl(var(--primary-foreground))] ${isPending(row.id) ? "opacity-60" : "hover:opacity-90"} bg-[hsl(var(--primary))]`}
                        disabled={isPending(row.id) || !hasActor()}
                        onClick={() => handleBuy(row)}
                      >
                        {isPending(row.id) ? { toString() { return app.t("promote.buying"); } } : app.t("promote.buy")}
                      </button>
                    </td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </div>
      </Show>
    </div>
  );
}
