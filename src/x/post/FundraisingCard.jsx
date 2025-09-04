// src/x/post/FundraisingCard.jsx
import { createMemo, createResource, Show, Switch, Match } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";
import { whenWsOpen } from "../../net/wsRuntime.js";
import { walletAccount } from "../../blockchain/wallet.js";
import Spinner from "../ui/Spinner.jsx";
import TokenValue from "../ui/TokenValue.jsx";
import ProgressBar from "../ui/ProgressBar.jsx";
import UserCard from "../ui/UserCard.jsx";

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

// Fetches details for a single campaign
async function fetchCampaignDetails(params) {
    const { app, campaignId } = params;
    if (!app.wsMethod || !campaignId) return null;

    try {
        await whenWsOpen();
        const listFundraisers = app.wsMethod("list-fundraisers");
        const res = await listFundraisers({
            id: campaignId,
            limit: 1,
            offset: 0,
            user: ''
        });

        const list = Array.isArray(res) ? res : Array.isArray(res?.list) ? res.list : [];
        return list[0] || null;
    } catch (e) {
        console.error(`Failed to fetch campaign #${campaignId}`, e);
        return { error: e.message };
    }
}

export default function FundraisingCard(props) {
  const app = useApp();
  const { t } = app;
  const campaignId = () => props.campaignId;

  const [campaignData] = createResource(
    () => ({ app, campaignId: campaignId() }), 
    fetchCampaignDetails
  );
  
  const campaign = createMemo(() => campaignData());
  const targetWei = createMemo(() => toWeiBigInt(campaign()?.target_amount));
  const raisedWei = createMemo(() => toWeiBigInt(campaign()?.raised));
  const percentage = createMemo(() => percentOf(raisedWei(), targetWei()));

  const savvaTokenAddress = () => app.info()?.savva_contracts?.SavvaToken?.address;
  
  const handleContribute = () => {
    // Placeholder for opening the contribution modal
    console.log("Contribute clicked for campaign:", campaignId());
  };

  return (
    <div
      class="rounded-lg p-4 text-[hsl(var(--card))] shadow-sm space-y-3 flex flex-col"
      style={{ background: "var(--gradient)" }}
      aria-label={t("fundraising.title")}
    >
      <h4 class="font-semibold uppercase text-center">{t("fundraising.title")} #{campaignId()}</h4>
      
      <Show when={!campaignData.loading} fallback={<div class="flex justify-center p-4"><Spinner /></div>}>
        <Switch>
          <Match when={campaignData.error || !campaign()}>
            <p class="text-sm text-center text-[hsl(var(--card))] opacity-80">
              {t("fundraising.card.notFound", { id: campaignId() })}
            </p>
          </Match>
          <Match when={campaign()}>
            <div class="space-y-3">
              <div class="text-center font-semibold text-sm">{campaign().title}</div>
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
                
                <ProgressBar value={percentage()} />

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

