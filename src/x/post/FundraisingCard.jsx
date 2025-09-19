// src/x/post/FundraisingCard.jsx
import { createMemo, createResource, Show, Switch, Match } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";
import { whenWsOpen } from "../../net/wsRuntime.js";
import { walletAccount } from "../../blockchain/wallet.js";
import { getSavvaContract } from "../../blockchain/contracts.js";
import Spinner from "../ui/Spinner.jsx";
import TokenValue from "../ui/TokenValue.jsx";
import ProgressBar from "../ui/ProgressBar.jsx";
import UserCard from "../ui/UserCard.jsx";
import FitToLines from "../ui/FitToLines.jsx";

// Helper to safely convert different number formats to BigInt
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

// Helper to calculate percentage
function percentOf(raisedWei, targetWei) {
  const r = toWeiBigInt(raisedWei);
  const t = toWeiBigInt(targetWei);
  if (t <= 0n) return 0;
  const p100 = (r * 10000n) / t;
  return Number(p100) / 100;
}

export default function FundraisingCard(props) {
  const app = useApp();
  const { t } = app;
  const campaignId = () => props.campaignId;

  // Resource 1: Fetch from API (always runs, listens for fundraiser updates)
  const [apiData] = createResource(
    () => ({ app, campaignId: campaignId(), refreshKey: app.fundraiserUpdateKey() }),
    async (params) => {
      const { app, campaignId } = params;
      if (!app.wsMethod || !campaignId) return null;
      try {
        await whenWsOpen();
        const listFundraisers = app.wsMethod("list-fundraisers");
        const res = await listFundraisers({ id: campaignId, limit: 1, offset: 0, user: '' });
        const list = Array.isArray(res) ? res : Array.isArray(res?.list) ? res.list : [];
        return list[0] || null;
      } catch (e) {
        console.error(`Failed to fetch campaign #${campaignId} from API`, e);
        return { error: e.message };
      }
    }
  );

  // Resource 2: Fetch from Contract (runs only when wallet is connected, listens for fundraiser updates)
  const [contractData] = createResource(
    () => ({ app, campaignId: campaignId(), walletConnected: !!walletAccount(), refreshKey: app.fundraiserUpdateKey() }),
    async (params) => {
      const { app, campaignId, walletConnected } = params;
      if (!app || !campaignId || !walletConnected) return null;
      try {
        const fundraiserContract = await getSavvaContract(app, "Fundraiser");
        const data = await fundraiserContract.read.campaigns([campaignId]);
        return {
          title: data[0],
          creator: data[1],
          targetAmount: data[2],
          totalContributed: data[3],
        };
      } catch (e) {
        console.error(`Failed to fetch campaign #${campaignId} from contract`, e);
        return { error: e.message };
      }
    }
  );

  // Memo to merge API and Contract data
  const campaign = createMemo(() => {
    const api = apiData();
    const contract = contractData();

    if (!api) return null; // If API hasn't loaded, we have nothing to show.
    if (api.error) return api; // Propagate API error

    // Start with the API data as the base
    let merged = {
      id: api.id,
      user: api.user,
      title: api.title,
      target_amount: api.target_amount,
      raised: api.raised,
      finished: api.finished
    };

    // If contract data is available, it overrides the amounts
    if (contract && !contract.error) {
      merged.target_amount = contract.targetAmount;
      merged.raised = contract.totalContributed;
    }

    return merged;
  });

  const targetWei = createMemo(() => toWeiBigInt(campaign()?.target_amount));
  const raisedWei = createMemo(() => toWeiBigInt(campaign()?.raised));
  const percentage = createMemo(() => percentOf(raisedWei(), targetWei()));
  const savvaTokenAddress = () => app.info()?.savva_contracts?.SavvaToken?.address;

  const handleContribute = () => {
    props.onContribute?.(campaignId());
  };

  const loading = createMemo(() => apiData.loading || (walletAccount() && contractData.loading));

  return (
    <div
      class="rounded-lg p-4 text-[hsl(var(--card))] shadow-sm space-y-3 flex flex-col"
      style={{ background: "var(--gradient)" }}
      aria-label={t("fundraising.title")}
    >
      <h4 class="font-semibold uppercase text-center">{t("fundraising.title")} #{campaignId()}</h4>

      <Show when={!loading()} fallback={<div class="flex justify-center p-4"><Spinner /></div>}>
        <Switch>
          <Match when={apiData.error || !campaign()}>
            <p class="text-sm text-center text-[hsl(var(--card))] opacity-80">
              {t("fundraising.card.notFound", { id: campaignId() })}
            </p>
          </Match>
          <Match when={campaign()}>
            <div class="space-y-3">
              <FitToLines
                maxLines={8}
                minRem={0.75}   // allow shrinking down to ~12px
                maxRem={0.875}  // start at ~14px to match `text-sm`
                class="text-center font-semibold"
              >
                {campaign().title}
              </FitToLines>
              <div>
                <div class="text-sm text-[hsl(var(--card))] opacity-80 mb-1">{t("fundraising.card.receiver")}:</div>
                <UserCard
                  author={campaign().user}
                  textColorClass="text-[hsl(var(--card))]"
                  mutedTextColorClass="text-[hsl(var(--card))] opacity-80"
                />
              </div>
            </div>
            <div class="space-y-2 text-sm">
              <div class="flex justify-between items-center">
                <span class="text-[hsl(var(--card))] opacity-80">{t("fundraising.card.collected")}:</span>
                <TokenValue amount={raisedWei()} tokenAddress={savvaTokenAddress()} format="vertical" />
              </div>

              <ProgressBar value={percentage()} colors="reversed" />

              <div class="flex justify-between items-center">
                <span class="text-[hsl(var(--card))] opacity-80">{t("fundraising.card.target")}:</span>
                <TokenValue amount={targetWei()} tokenAddress={savvaTokenAddress()} format="vertical" />
              </div>
            </div>

            <div class="pt-2 text-center">
              <Show when={campaign().finished} fallback={
                <Show when={walletAccount()} fallback={
                  <p class="text-xs text-[hsl(var(--card))] opacity-80">{t("fundraising.card.connectWallet")}</p>
                }>
                  <button
                    onClick={handleContribute}
                    class="w-full px-4 py-2 mt-2 rounded bg-black/20 dark:bg-white/20 text-current hover:bg-black/30 dark:hover:bg-white/30 text-sm font-semibold"
                  >
                    {t("fundraising.card.contribute")}
                  </button>
                </Show>
              }>
                <p class="text-sm font-semibold text-[hsl(var(--card))] opacity-80">{t("fundraising.card.finished")}</p>
              </Show>
            </div>
          </Match>
        </Switch>
      </Show>
    </div>
  );
}
