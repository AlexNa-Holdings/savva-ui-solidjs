// src/x/pages/PromoCodesPage.jsx
import { Show, For, onMount, createSignal } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";
import ClosePageButton from "../ui/ClosePageButton.jsx";
import Spinner from "../ui/Spinner.jsx";
import UserCard from "../ui/UserCard.jsx";
import TokenValue from "../ui/TokenValue.jsx";
import NewPromoModal from "../modals/NewPromoModal.jsx";
import { connectWallet, walletAccount, isWalletAvailable, eagerConnect } from "../../blockchain/wallet.js";
import { getSavvaContract } from "../../blockchain/contracts.js";
import { toChecksumAddress } from "../../blockchain/utils.js";
import { getWsApi } from "../../net/wsRuntime.js";
import { ArrowRightIcon } from "../ui/icons/ArrowIcons.jsx";
import { navigate } from "../../routing/hashRouter.js";

function bi(v) {
  try {
    if (typeof v === "bigint") return v;
    if (typeof v === "number") return BigInt(v);
    if (typeof v === "string") return BigInt(v);
  } catch {}
  return 0n;
}
function isZeroHash(h) {
  const s = String(h || "");
  return s === "0x" + "0".repeat(64);
}
function fmtTime(app, ts) {
  const n = Number(bi(ts));
  if (!Number.isFinite(n) || n <= 0) return "—";
  try {
    const lang = (app.lang?.() || "en").toLowerCase();
    return new Date(n * 1000).toLocaleString(lang);
  } catch { return new Date(n * 1000).toLocaleString(); }
}
function normalizePromo(raw, fallbackHash, fallbackIndex) {
  const donator   = raw?.donator ?? raw?.[0] ?? null;
  const savva     = raw?.savva_amount ?? raw?.savvaAmount ?? raw?.[1] ?? 0n;
  const hash      = raw?.hash ?? raw?.[2] ?? fallbackHash ?? "0x";
  const basic     = raw?.pls_amount ?? raw?.plsAmount ?? raw?.[3] ?? 0n;
  const validTill = raw?.valid_till ?? raw?.valid_til ?? raw?.validTill ?? raw?.[4] ?? 0n;
  const index     = raw?.index ?? raw?.[5] ?? fallbackIndex ?? 0;
  return {
    hash,
    donator,
    savva: bi(savva),
    basic: bi(basic),
    validTill: bi(validTill),
    index: Number(index),
  };
}

function UserCell(props) {
  const app = useApp();
  const [user, setUser] = createSignal(null);

  onMount(async () => {
    const addr = props.address;
    if (!addr) return setUser(null);
    try {
      const profile = await getWsApi().call("get-user", {
        domain: String(app.domain?.() || app.config?.()?.domain || ""),
        user_addr: toChecksumAddress(addr),
      });
      setUser({ ...profile, address: addr });
    } catch {
      setUser({ address: addr });
    }
  });

  return (
    <div class="min-w-0">
      <UserCard author={user() || { address: props.address }} compact />
    </div>
  );
}

export default function PromoCodesPage() {
  const app = useApp();
  const { t } = app;

  const [loading, setLoading] = createSignal(true);
  const [items, setItems] = createSignal([]);
  const [hasExpiredAny, setHasExpiredAny] = createSignal(false);

  const [newOpen, setNewOpen] = createSignal(false);

  onMount(() => {
    if (isWalletAvailable()) eagerConnect().catch(() => {});
    void reload();
  });

  async function readPromoStruct(promo, hash, idx) {
    try {
      const tuple = await promo.read.getPromoCode([hash]);
      return normalizePromo(tuple, hash, idx);
    } catch {
      try {
        const tuple = await promo.read.promoCodesMap([hash]);
        return normalizePromo(tuple, hash, idx);
      } catch {
        return null;
      }
    }
  }

  async function reload() {
    setLoading(true);
    try {
      const promo = await getSavvaContract(app, "Promo");
      const countBI = await promo.read.getPromoCodesCount();
      const count = Number(countBI ?? 0n);
      const idxs = Array.from({ length: count }, (_, i) => i);

      const hashes = await Promise.all(
        idxs.map(i => promo.read.promoCodes([BigInt(i)]).catch(() => "0x"))
      );

      const rows = await Promise.all(
        hashes.map((h, i) => isZeroHash(h) ? null : readPromoStruct(promo, h, i))
      );

      let filtered = rows.filter(Boolean).sort((a, b) => a.index - b.index);

      // Admin sees all; non-admin only sees promos where donator == actor
      const isAdmin = !!app.authorizedUser?.()?.isAdmin;
      if (!isAdmin) {
        const me = (() => {
          try {
            const addr = app.actorAddress?.() || app.authorizedUser?.()?.address || walletAccount();
            return addr ? toChecksumAddress(addr) : "";
          } catch { return ""; }
        })();
        filtered = me
          ? filtered.filter(r => {
              try { return toChecksumAddress(r.donator) === me; }
              catch { return false; }
            })
          : [];
      }

      setItems(filtered);

      const expiredFlag = await promo.read.hasExpiredPromoCodes().catch(() => false);
      setHasExpiredAny(Boolean(expiredFlag));
    } finally {
      setLoading(false);
    }
  }

  const onConnect = async () => {
    try {
      await connectWallet();
      if (app.desiredChainId?.()) {
        await app.ensureWalletOnDesiredChain?.();
      }
      await reload();
    } catch (e) {
      console.error("PromoCodesPage: connect failed", e);
    }
  };

  return (
    <main class="p-4 max-w-5xl mx-auto space-y-4">
      <ClosePageButton />

      <div class="flex items-center justify-between">
        <h1 class="text-xl font-semibold">{t("promocodes.title")}</h1>
        <div class="flex gap-2">
          <Show when={hasExpiredAny()}>
            <button
              type="button"
              class="px-3 py-2 rounded bg-[hsl(var(--destructive))] text-[hsl(var(--destructive-foreground))] hover:opacity-90"
              onClick={() => {/* wire with sendAsActor() later */}}
            >
              {t("promocodes.withdrawAllExpired")}
            </button>
          </Show>
          <button
            type="button"
            class="px-3 py-2 rounded bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90"
            onClick={() => setNewOpen(true)}
          >
            {t("promocodes.create")}
          </button>
        </div>
      </div>

      <Show
        when={!!walletAccount()}
        fallback={
          <div class="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[hsl(var(--card-foreground))] p-6 text-center space-y-3">
            <h3 class="text-lg font-semibold">{t("fundraising.contribute.connectTitle")}</h3>
            <p class="text-sm opacity-80">{t("wallet.connectPrompt")}</p>
            <div>
              <button
                type="button"
                class="px-4 py-2 rounded bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90"
                onClick={onConnect}
              >
                {t("wallet.connect")}
              </button>
            </div>
          </div>
        }
      >
        <div class="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[hsl(var(--card-foreground))]">
          <Show when={!loading()} fallback={<div class="p-6"><Spinner /></div>}>
            <Show
              when={items().length > 0}
              fallback={<div class="p-6 text-sm opacity-80">{t("promocodes.empty")}</div>}
            >
              <div class="overflow-x-auto">
                <table class="min-w-full text-sm">
                  <thead class="text-[hsl(var(--muted-foreground))]">
                    <tr class="border-b border-[hsl(var(--border))]">
                      <th class="text-left px-4 py-3">{t("promocodes.col.donator")}</th>
                      <th class="text-right px-4 py-3">{t("promocodes.col.savva")}</th>
                      <th class="text-right px-4 py-3">{t("promocodes.col.basic")}</th>
                      <th class="text-left px-4 py-3">{t("promocodes.col.validTill")}</th>
                      <th class="text-left px-4 py-3">{t("promote.table.actions")}</th>
                      <th class="px-2 py-3"></th>
                    </tr>
                  </thead>
                  <tbody>
                    <For each={items()}>
                      {(row) => {
                        const expired = Number(row.validTill) * 1000 < Date.now();
                        return (
                          <tr class="border-b border-[hsl(var(--border))]/50">
                            <td class="px-4 py-3">
                              <UserCell address={row.donator} />
                            </td>
                            <td class="px-4 py-3 text-right">
                              <TokenValue amount={row.savva} format="vertical" />
                            </td>
                            <td class="px-4 py-3 text-right">
                              <TokenValue amount={row.basic} tokenAddress="0" format="vertical" />
                            </td>
                            <td class="px-4 py-3">
                              <span class={expired ? "text-[hsl(var(--destructive))]" : ""} title={String(row.hash)}>
                                {fmtTime(app, row.validTill)}
                              </span>
                            </td>
                            <td class="px-4 py-3">
                              <Show when={expired}>
                                <button
                                  type="button"
                                  class="px-3 py-1.5 rounded bg-[hsl(var(--accent))] text-[hsl(var(--accent-foreground))] hover:opacity-90"
                                  onClick={() => {/* per-row withdraw via sendAsActor() later */}}
                                >
                                  {t("promocodes.withdraw")}
                                </button>
                              </Show>
                            </td>

                            {/* Open redeem page */}
                            <td class="px-2 py-3 align-top">
                              <div class="flex items-center justify-end">
                                <button
                                  class="p-1 rounded hover:bg-[hsl(var(--accent))]"
                                  title={t("promocodes.open")}
                                  onClick={() => navigate(`/promo-code/${row.hash}`)}
                                >
                                  <ArrowRightIcon class="w-5 h-5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      }}
                    </For>
                  </tbody>
                </table>
              </div>
            </Show>
          </Show>
        </div>
      </Show>

      <NewPromoModal
        open={newOpen()}
        onClose={() => setNewOpen(false)}
        onCreated={() => {
          setNewOpen(false);
          reload();
        }}
      />
    </main>
  );
}
