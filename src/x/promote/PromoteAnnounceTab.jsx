// src/x/promote/PromoteAnnounceTab.jsx
import { createMemo, createResource, createSignal, For, Show } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";
import { loadAssetResource } from "../../utils/assetLoader.js";
import Spinner from "../ui/Spinner.jsx";
import { formatUnits } from "viem";
import { isWalletAvailable } from "../../blockchain/wallet.js";
import * as chain from "../../blockchain/contracts.js";
import { dbg } from "../../utils/debug.js";

const NATIVE_DECIMALS = 18;

function getLocalizedTitle(titleData, currentLang) {
  if (!titleData || typeof titleData !== "object") return "";
  if (titleData[currentLang]) return titleData[currentLang];
  if (titleData["*"]) return titleData["*"];
  if (titleData.en) return titleData.en;
  const firstKey = Object.keys(titleData)[0];
  return firstKey ? titleData[firstKey] : "";
}

// Use contracts.js the same way we do elsewhere
async function readListMarketPrice(app, listId) {
  const args = [String(listId)];
  try {
    const out = await app?.contracts?.ListMarket?.read?.getPrice?.(...args);
    if (typeof out === "bigint") return out;
    if (out != null) return BigInt(out);
  } catch (e) {
    dbg.warn?.("PromoteAnnounceTab: prebound getPrice failed", e?.message);
  }
  try {
    const out = await chain.readContract?.(app, {
      contractName: "ListMarket",
      functionName: "getPrice",
      args,
    });
    if (typeof out === "bigint") return out;
    if (out != null) return BigInt(out);
  } catch (e) {
    dbg.warn?.("PromoteAnnounceTab: readContract getPrice failed", e?.message);
  }
  return 0n;
}

export default function PromoteAnnounceTab(props) {
  const app = useApp();
  const { t } = app;
  const post = () => props.post || null;

  const modulePath = createMemo(() => app.domainAssetsConfig?.()?.modules?.content_lists);
  const currentLang = createMemo(() => (app.lang?.() || "en").toLowerCase());
  const nativeSymbol = createMemo(() => app.desiredChain?.()?.nativeCurrency?.symbol || "ETH");

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
    return Object.entries(obj).map(([id, data]) => ({
      id,
      title: getLocalizedTitle(data?.title || {}, currentLang()),
    }));
  });

  const [allPrices, setAllPrices] = createSignal([]);

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

      setAllPrices(results);
      dbg.log("PromoteAnnounceTab:price-scan", {
        results: results.map((r) => ({
          id: r.id,
          priceWei: typeof r.price === "bigint" ? r.price.toString() : String(r.price),
        })),
      });

      return results
        .filter((r) => (typeof r.price === "bigint" ? r.price > 0n : Number(r.price) > 0))
        .map((r) => ({
          ...r,
          priceFormatted:
            typeof r.price === "bigint" ? formatUnits(r.price, NATIVE_DECIMALS) : String(r.price),
        }));
    }
  );

  const connected = createMemo(() => isWalletAvailable());

  return (
    <div class="bg-[hsl(var(--background))] rounded-b-xl rounded-t-none border border-[hsl(var(--border))] border-t-0 p-4 space-y-4 -mt-px">
      <p class="text-sm text-[hsl(var(--muted-foreground))]">
        {t("promote.announce.intro")}
      </p>

      <Show when={!connected()}>
        <div class="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-3 text-sm">
          {t("wallet.connectPrompt")}
        </div>
      </Show>

      <Show when={pricedLists.loading}>
        <div class="flex justify-center py-10">
          <Spinner />
        </div>
      </Show>

      <Show when={!pricedLists.loading && Array.isArray(pricedLists()) && pricedLists().length === 0}>
        <div class="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-3 text-sm">
          {t("promote.announce.noPaidLists")}
        </div>

        {/* Small debug: which ids we queried & raw wei */}
        <div class="mt-3 rounded-lg border border-dashed border-[hsl(var(--border))] bg-[hsl(var(--card))] p-3">
          <div class="text-xs opacity-70 mb-2">{t("promote.announce.debugTitle")}</div>
          <ul class="text-xs font-mono grid gap-1">
            <For each={allPrices()}>
              {(r) => (
                <li>
                  {r.id}: {typeof r.price === "bigint" ? r.price.toString() : String(r.price)}
                </li>
              )}
            </For>
          </ul>
        </div>
      </Show>

      <Show when={!pricedLists.loading && Array.isArray(pricedLists()) && pricedLists().length > 0}>
        <div class="overflow-x-auto rounded-lg border border-[hsl(var(--border))]">
          <table class="w-full text-sm">
            <thead class="bg-[hsl(var(--muted))]">
              <tr class="text-left">
                <th class="px-3 py-2 w-40">{t("promote.table.id")}</th>
                <th class="px-3 py-2">{t("promote.table.title")}</th>
                <th class="px-3 py-2 w-40">{t("promote.table.price")}</th>
                <th class="px-3 py-2 w-36 text-right">{t("promote.table.actions")}</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-[hsl(var(--border))] bg-[hsl(var(--card))]">
              <For each={pricedLists()}>
                {(row) => (
                  <tr>
                    <td class="px-3 py-2 font-mono text-xs">{row.id}</td>
                    <td class="px-3 py-2">{row.title || row.id}</td>
                    <td class="px-3 py-2">
                      {row.priceFormatted} {nativeSymbol()}
                    </td>
                    <td class="px-3 py-2 text-right">
                      <button
                        class="px-3 py-1.5 rounded-lg bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90"
                        onClick={() => {
                          try {
                            window.dispatchEvent(
                              new CustomEvent("savva:promote:buy", {
                                detail: { list_id: row.id, price: row.price, post: post() },
                              })
                            );
                          } catch {}
                        }}
                      >
                        {t("promote.buy")}
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
