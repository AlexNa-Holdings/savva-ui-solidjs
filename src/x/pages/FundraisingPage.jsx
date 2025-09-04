// src/x/pages/FundraisingPage.jsx
import { For, Show, createMemo, createSignal, onMount, onCleanup, createEffect, on } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";
import { navigate } from "../../routing/hashRouter.js";
import ClosePageButton from "../ui/ClosePageButton.jsx";
import UserCard from "../ui/UserCard.jsx";
import TokenValue from "../ui/TokenValue.jsx";
import Spinner from "../ui/Spinner.jsx";
import ProgressBar from "../ui/ProgressBar.jsx";
import { whenWsOpen } from "../../net/wsRuntime.js";
import { toChecksumAddress } from "../../blockchain/utils.js";
import { getSavvaContract } from "../../blockchain/contracts.js";
import { createPublicClient, http } from "viem";
import { pushToast, pushErrorToast } from "../../ui/toast.js";
import NewFundraisingModal from "../fundraising/NewFundraisingModal.jsx";

const DEFAULT_LIMIT = 20;

function toWeiBigInt(value) {
  if (typeof value === "bigint") return value;
  if (typeof value === "string") {
    if (/^\d+$/.test(value)) return BigInt(value);
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
      return 0n;
    }
    const cleaned = value.replace(/\D/g, "");
    return cleaned ? BigInt(cleaned) : 0n;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const s = value.toString();
    if (/e/i.test(s)) return toWeiBigInt(s);
    if (Number.isInteger(value)) return BigInt(value);
    return 0n;
  }
  return 0n;
}

function percentOf(raisedWei, targetWei) {
  const r = toWeiBigInt(raisedWei);
  const t = toWeiBigInt(targetWei);
  if (t <= 0n) return 0;
  const p100 = (r * 10000n) / t;
  return Number(p100) / 100;
}

export default function FundraisingPage() {
  const app = useApp();
  const { t } = app;

  const [onlyMy, setOnlyMy] = createSignal(true);
  const [showFinished, setShowFinished] = createSignal(false);
  const [campaigns, setCampaigns] = createSignal([]);
  const [offset, setOffset] = createSignal(0);
  const [hasMore, setHasMore] = createSignal(true);
  const [loading, setLoading] = createSignal(false);
  const [isClosing, setIsClosing] = createSignal(null);
  const [showCreateModal, setShowCreateModal] = createSignal(false);

  const wsList = createMemo(() => app.wsMethod ? app.wsMethod("list-fundraisers") : null);
  const userAddr = createMemo(() => app.authorizedUser()?.address || "");

  async function loadMore() {
    if (loading() || !hasMore()) return;
    setLoading(true);

    try {
      await whenWsOpen();
      const fetcher = wsList();
      if (!fetcher) return;
      
      const req = {
        id: 0,
        limit: DEFAULT_LIMIT,
        offset: offset(),
        show_finished: showFinished(),
      };
      if (onlyMy() && userAddr()) req.user = toChecksumAddress(userAddr());
      
      const res = await fetcher(req);
      const list = Array.isArray(res) ? res : Array.isArray(res?.list) ? res.list : [];
      
      if (list.length > 0) {
        setCampaigns(prev => [...prev, ...list]);
      }
      
      if (res?.next_offset) {
        setOffset(res.next_offset);
      } else {
        setHasMore(false);
      }
    } catch (e) {
      console.error("Failed to fetch fundraisers:", e);
    } finally {
      setLoading(false);
    }
  }
  
  const refreshList = () => {
    setCampaigns([]);
    setOffset(0);
    setHasMore(true);
    queueMicrotask(loadMore);
  };

  createEffect(on([onlyMy, showFinished], refreshList, { defer: true }));

  onMount(() => {
    loadMore();
    const handleScroll = () => {
      const scrollThreshold = 400;
      const nearBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - scrollThreshold;
      if (nearBottom) loadMore();
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    onCleanup(() => window.removeEventListener('scroll', handleScroll));
  });

  const isMyCampaign = (campaign) => {
    const campaignCreator = campaign?.user?.address?.toLowerCase();
    const currentUser = app.authorizedUser()?.address?.toLowerCase();
    return currentUser && campaignCreator === currentUser;
  };

  async function handleCloseCampaign(campaignId) {
    setIsClosing(campaignId);
    try {
      const contract = await getSavvaContract(app, "Fundraiser", { write: true });
      const hash = await contract.write.closeCampaign([campaignId]);
      
      const publicClient = createPublicClient({
          chain: app.desiredChain(),
          transport: http(app.desiredChain().rpcUrls[0]),
      });

      await publicClient.waitForTransactionReceipt({ hash });
      
      pushToast({ type: "success", message: t("fundraising.actions.close.success") });
      refreshList();
    } catch (e) {
      pushErrorToast(e, { context: t("fundraising.actions.close.error") });
    } finally {
      setIsClosing(null);
    }
  }

  const toggleOnlyMy = (e) => setOnlyMy(e.currentTarget.checked);
  const toggleShowFinished = (e) => setShowFinished(e.currentTarget.checked);
  const showLoginHint = createMemo(() => onlyMy() && !userAddr());

  return (
    <>
      <main class="p-4 max-w-6xl mx-auto space-y-4">
        <ClosePageButton />
        <div class="flex items-center justify-between">
          <h2 class="text-2xl font-semibold">{t("fundraising.title")}</h2>
        </div>

        <div class="flex items-center justify-between gap-4">
          <div class="flex items-center gap-4">
            <label class="inline-flex items-center gap-2 text-sm">
              <input type="checkbox" checked={onlyMy()} onInput={toggleOnlyMy} />
              <span>{t("fundraising.onlyMy")}</span>
            </label>
            <label class="inline-flex items-center gap-2 text-sm">
              <input type="checkbox" checked={showFinished()} onInput={toggleShowFinished} />
              <span>{t("fundraising.showFinished")}</span>
            </label>
            <Show when={showLoginHint()}>
              <div class="text-xs text-[hsl(var(--muted-foreground))]">
                {t("fundraising.loginHint")}
              </div>
            </Show>
          </div>
          <button
            type="button"
            class="px-3 py-2 rounded-md bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90"
            onClick={() => setShowCreateModal(true)}
            title={t("fundraising.create")}
          >
            {t("fundraising.create")}
          </button>
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
                  <th class="px-3 py-2 text-right w-[100px]">{t("fundraising.th.actions")}</th>
                </tr>
              </thead>
              <tbody>
                <Show when={campaigns().length > 0} fallback={
                  <Show when={!loading()}>
                    <tr>
                      <td colSpan="6" class="px-3 py-6 text-center text-[hsl(var(--muted-foreground))]">
                        {t("fundraising.empty")}
                      </td>
                    </tr>
                  </Show>
                }>
                  <For each={campaigns()}>{(it) => {
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
                        <td class="px-3 py-2 align-top text-right">
                          <Show when={!it.finished && isMyCampaign(it)}>
                            <button
                              class="px-2 py-1 text-xs rounded border border-[hsl(var(--input))] hover:bg-[hsl(var(--accent))] disabled:opacity-50"
                              onClick={() => handleCloseCampaign(it.id)}
                              title={t("fundraising.actions.close.tip")}
                              disabled={isClosing() === it.id}
                            >
                              <Show when={isClosing() === it.id} fallback={t("fundraising.actions.close.label")}>
                                  <Spinner class="w-4 h-4" />
                              </Show>
                            </button>
                          </Show>
                        </td>
                      </tr>
                    );
                  }}</For>
                </Show>
              </tbody>
            </table>
          </div>
          <Show when={loading()}>
            <div class="flex justify-center p-4"><Spinner /></div>
          </Show>
        </div>
      </main>
      <NewFundraisingModal 
        isOpen={showCreateModal()}
        onClose={() => setShowCreateModal(false)}
        onSuccess={refreshList}
      />
    </>
  );
}