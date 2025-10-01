// src/x/promote/NftOwnerOptions.jsx
import { createMemo, createSignal, Show, createResource, createEffect } from "solid-js";
import Tabs from "../ui/Tabs.jsx";
import Spinner from "../ui/Spinner.jsx";
import AmountInput from "../ui/AmountInput.jsx";
import TokenValue from "../ui/TokenValue.jsx";
import { getSavvaContract } from "../../blockchain/contracts.js";
import { pushToast, pushErrorToast } from "../../ui/toast.js";
import { getConfigParam } from "../../blockchain/config.js";
import { dbg } from "../../utils/debug.js";
import { sendAsActor } from "../../blockchain/npoMulticall.js";

const SECONDS_IN_DAY = 86400;

export default function NftOwnerOptions(props) {
  const app = props.app;
  const { t } = app;

  const tabs = () => [
    { id: "sale", label: t("nft.owner.tabs.sale") || "Put on Sale" },
    { id: "auction", label: t("nft.owner.tabs.auction") || "Start Auction" },
    { id: "burn", label: t("nft.owner.tabs.burn") || "Burn NFT" },
  ];

  const [activeTab, setActiveTab] = createSignal("sale");

  const savvaTokenAddress = createMemo(() => app.info?.()?.savva_contracts?.SavvaToken?.address || "");
  const actorAddress = createMemo(() => app.actorAddress?.() || app.authorizedUser?.()?.address || "");

  // ---------- Sale ----------
  const [salePriceText, setSalePriceText] = createSignal("");
  const [saleAmountWei, setSaleAmountWei] = createSignal(0n);
  const [saleBusy, setSaleBusy] = createSignal(false);
  const saleDisabled = createMemo(() => saleBusy() || saleAmountWei() <= 0n);

  const handleSaleSubmit = async (e) => {
    e?.preventDefault();
    if (saleDisabled()) return;

    setSaleBusy(true);
    let approveToastId, listToastId;

    try {
      const marketplace = await getSavvaContract(app, "NFTMarketplace");
      const price = saleAmountWei();

      // Approve NFT transfer
      approveToastId = pushToast({
        type: "info",
        message: t("nft.owner.sale.toast.approving") || "Approving NFT transfer…",
        autohideMs: 0,
      });

      await sendAsActor(app, {
        contractName: "ContentNFT",
        functionName: "approve",
        args: [marketplace.address, props.tokenId],
      });

      // List on market
      app.dismissToast?.(approveToastId);
      listToastId = pushToast({
        type: "info",
        message: t("nft.owner.sale.toast.listing") || "Listing NFT for sale…",
        autohideMs: 0,
      });

      await sendAsActor(app, {
        contractName: "NFTMarketplace",
        functionName: "addToMarket",
        args: [props.tokenId, price],
      });

      app.dismissToast?.(listToastId);
      pushToast({ type: "success", message: t("nft.owner.sale.toast.success") || "NFT listed for sale." });
      setSalePriceText("");
      setSaleAmountWei(0n);
      props.onActionComplete?.({ type: "sale", price });
    } catch (err) {
      pushErrorToast(err, { context: t("nft.owner.sale.toast.error") || "Failed to list NFT." });
      dbg.error?.("NftOwnerOptions:sale", err);
    } finally {
      if (approveToastId) app.dismissToast?.(approveToastId);
      if (listToastId) app.dismissToast?.(listToastId);
      setSaleBusy(false);
    }
  };

  // ---------- Auction ----------
  const [auctionPriceText, setAuctionPriceText] = createSignal("");
  const [auctionAmountWei, setAuctionAmountWei] = createSignal(0n);
  const [auctionDurationDays, setAuctionDurationDays] = createSignal(3);
  const [auctionBusy, setAuctionBusy] = createSignal(false);

  const [maxDurationSec] = createResource(
    () => app.selectedDomainName?.() || "",
    async () => await getConfigParam(app, "nft_auction_max_duration")
  );

  const maxDurationSeconds = createMemo(() => bigIntOrZero(maxDurationSec()));
  const maxDurationDays = createMemo(() => {
    const sec = maxDurationSeconds();
    if (sec <= 0n) return null;
    const num = Number(sec) / SECONDS_IN_DAY;
    return Number.isFinite(num) && num > 0 ? num : null;
  });

  const maxDurationDaysText = createMemo(() => {
    const val = maxDurationDays();
    if (!val) return null;
    const digits = val >= 1 ? 2 : 3;
    return val.toLocaleString(undefined, { maximumFractionDigits: digits });
  });

  createEffect(() => {
    const maxDays = maxDurationDays();
    if (!maxDays) return;
    if (auctionDurationDays() > maxDays) setAuctionDurationDays(maxDays);
  });

  const auctionDurationSeconds = createMemo(() => {
    const days = Number(auctionDurationDays());
    if (!Number.isFinite(days) || days <= 0) return 0n;
    return BigInt(Math.round(days * SECONDS_IN_DAY));
  });

  const auctionDurationTooLong = createMemo(() => {
    const maxSec = maxDurationSeconds();
    if (maxSec <= 0n) return false;
    return auctionDurationSeconds() > maxSec;
  });

  const [minStakeRes] = createResource(
    () => app.selectedDomainName?.() || "",
    async () => await getConfigParam(app, "min_staked_for_nft_auction")
  );

  const [actorStakeRes, { refetch: refetchStake }] = createResource(
    () => (actorAddress() && chain() && rpcUrl()) ? actorAddress() : null,
    async (addr) => {
      if (!addr) return 0n;
      try {
        const staking = await getSavvaContract(app, "Staking");
        return await staking.read.balanceOf([addr]);
      } catch (err) {
        dbg.warn?.("NftOwnerOptions:stake", err?.message || err);
        return 0n;
      }
    }
  );

  createEffect(() => {
    actorAddress();
    chain();
    rpcUrl();
    refetchStake?.();
  });

  const minStakeWei = createMemo(() => bigIntOrZero(minStakeRes()));
  const actorStakeWei = createMemo(() => bigIntOrZero(actorStakeRes()));
  const stakeDataLoading = createMemo(() => minStakeRes.loading || actorStakeRes.loading);
  const hasEnoughStake = createMemo(() => {
    const required = minStakeWei();
    if (required <= 0n) return true;
    return actorStakeWei() >= required;
  });

  const auctionDisabled = createMemo(
    () =>
      auctionBusy() ||
      auctionAmountWei() <= 0n ||
      auctionDurationSeconds() <= 0n ||
      auctionDurationTooLong() ||
      !hasEnoughStake()
  );

  // ---------- Burn ----------
  const [burnBusy, setBurnBusy] = createSignal(false);

  const burnDisabled = createMemo(() => burnBusy());

  const handleBurn = async (e) => {
    e?.preventDefault();
    if (burnDisabled()) return;

    setBurnBusy(true);
    let burnToastId;

    try {
      burnToastId = pushToast({
        type: "info",
        message: t("nft.owner.burn.toast.pending") || "Burning NFT…",
        autohideMs: 0,
      });

      await sendAsActor(app, {
        contractName: "ContentNFT",
        functionName: "burn",
        args: [props.tokenId],
      });

      app.dismissToast?.(burnToastId);
      pushToast({ type: "success", message: t("nft.owner.burn.toast.success") || "NFT burned." });
      props.onActionComplete?.({ type: "burn" });
    } catch (err) {
      pushErrorToast(err, { context: t("nft.owner.burn.toast.error") || "Failed to burn NFT." });
      dbg.error?.("NftOwnerOptions:burn", err);
    } finally {
      if (burnToastId) app.dismissToast?.(burnToastId);
      setBurnBusy(false);
    }
  };

  const handleAuctionSubmit = async (e) => {
    e?.preventDefault();
    if (auctionDisabled()) return;

    setAuctionBusy(true);
    let approveToastId, createToastId;

    try {
      const auctionContract = await getSavvaContract(app, "NFTAuction");
      const price = auctionAmountWei();
      const durationSeconds = auctionDurationSeconds();

      // Approve NFT transfer
      approveToastId = pushToast({
        type: "info",
        message: t("nft.owner.auction.toast.approving") || "Approving NFT transfer…",
        autohideMs: 0,
      });

      await sendAsActor(app, {
        contractName: "ContentNFT",
        functionName: "approve",
        args: [auctionContract.address, props.tokenId],
      });

      // Create auction
      app.dismissToast?.(approveToastId);
      createToastId = pushToast({
        type: "info",
        message: t("nft.owner.auction.toast.creating") || "Creating auction…",
        autohideMs: 0,
      });

      await sendAsActor(app, {
        contractName: "NFTAuction",
        functionName: "createAuction",
        args: [props.tokenId, price, durationSeconds],
      });

      app.dismissToast?.(createToastId);
      pushToast({ type: "success", message: t("nft.owner.auction.toast.success") || "Auction created." });
      setAuctionPriceText("");
      setAuctionAmountWei(0n);
      const defaultDays = maxDurationDays();
      setAuctionDurationDays(defaultDays && defaultDays < 3 ? defaultDays : 3);
      props.onActionComplete?.({ type: "auction", durationSeconds, startingPrice: price });
    } catch (err) {
      pushErrorToast(err, { context: t("nft.owner.auction.toast.error") || "Failed to start auction." });
      dbg.error?.("NftOwnerOptions:auction", err);
    } finally {
      if (approveToastId) app.dismissToast?.(approveToastId);
      if (createToastId) app.dismissToast?.(createToastId);
      setAuctionBusy(false);
    }
  };

  return (
    <div class="space-y-4">
      <Tabs items={tabs()} value={activeTab()} onChange={setActiveTab} compactWidth={480} />

      <Show when={activeTab() === "sale"}>
        <form class="space-y-4 mt-4" onSubmit={handleSaleSubmit}>
          <div class="space-y-2">
            <label class="block text-sm font-medium text-[hsl(var(--foreground))]">
              {t("nft.owner.sale.price") || "Sale price"}
            </label>
            <AmountInput
              tokenAddress={savvaTokenAddress()}
              value={salePriceText()}
              onChange={(payload) => {
                setSalePriceText(payload?.text ?? "");
                setSaleAmountWei(payload?.amountWei ?? 0n);
              }}
            />
          </div>

          <button
            type="submit"
            disabled={saleDisabled()}
            class={`inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium text-[hsl(var(--primary-foreground))] bg-[hsl(var(--primary))] ${saleDisabled() ? "opacity-60" : "hover:opacity-90"}`}
          >
            <Show when={saleBusy()} fallback={t("nft.owner.sale.submit") || "List for Sale"}>
              <Spinner class="w-4 h-4" />
            </Show>
          </button>
        </form>
      </Show>

      <Show when={activeTab() === "auction"}>
        <div class="mt-4 space-y-4">
          <Show when={!stakeDataLoading()} fallback={<div class="flex justify-center py-6"><Spinner /></div>}>
            <Show when={hasEnoughStake()} fallback={
              <div class="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 space-y-3 text-sm text-[hsl(var(--muted-foreground))]">
                <p>{t("nft.owner.auction.needStake") || "Please stake at least the following amount of SAVVA to start an auction:"}</p>
                <div class="flex justify-center">
                  <TokenValue amount={minStakeWei()} tokenAddress={savvaTokenAddress() || ""} format="vertical" />
                </div>
              </div>
            }>
              <form class="space-y-4" onSubmit={handleAuctionSubmit}>
                <div class="space-y-2">

                  <AmountInput
                    label={t("nft.owner.auction.price") || "Starting price"}
                    tokenAddress={savvaTokenAddress()}
                    value={auctionPriceText()}
                    onChange={(payload) => {
                      setAuctionPriceText(payload?.text ?? "");
                      setAuctionAmountWei(payload?.amountWei ?? 0n);
                    }}
                  />
                </div>

                <div class="space-y-2">
                  <label class="block text-sm font-medium text-[hsl(var(--foreground))]">
                    {t("nft.owner.auction.duration") || "Duration (days)"}
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={auctionDurationDays()}
                    onInput={(e) => setAuctionDurationDays(Math.max(0, Number(e.currentTarget.value)))}
                    class="w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 text-sm"
                  />
                  <Show when={maxDurationDaysText()}>
                    <p class="text-xs text-[hsl(var(--muted-foreground))]">
                      {t("nft.owner.auction.maxDuration", { days: maxDurationDaysText() }) || `Maximum duration: ${maxDurationDaysText()} days`}
                    </p>
                  </Show>
                  <Show when={auctionDurationTooLong()}>
                    <p class="text-xs text-[hsl(var(--destructive))]">
                      {t("nft.owner.auction.durationTooLong") || "Duration exceeds the allowed maximum."}
                    </p>
                  </Show>
                </div>

                <button
                  type="submit"
                  disabled={auctionDisabled()}
                  class={`inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium text-[hsl(var(--primary-foreground))] bg-[hsl(var(--primary))] ${auctionDisabled() ? "opacity-60" : "hover:opacity-90"}`}
                >
                  <Show when={auctionBusy()} fallback={t("nft.owner.auction.submit") || "Start Auction"}>
                    <Spinner class="w-4 h-4" />
                  </Show>
                </button>
              </form>
            </Show>
          </Show>
        </div>
      </Show>

      <Show when={activeTab() === "burn"}>
        <div class="mt-4 space-y-4">
          <p class="text-sm text-[hsl(var(--muted-foreground))]">
            {t("nft.owner.burn.explainer") || "Burn your NFT. You can mint it again if you want."}
          </p>
          <button
            type="button"
            onClick={handleBurn}
            disabled={burnDisabled()}
            class={`inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium text-[hsl(var(--destructive-foreground))] bg-[hsl(var(--destructive))] ${burnDisabled() ? "opacity-70" : "hover:opacity-90"}`}
          >
            <Show when={burnBusy()} fallback={t("nft.owner.burn.submit") || "Burn NFT"}>
              <Spinner class="w-4 h-4" />
            </Show>
          </button>
        </div>
      </Show>
    </div>
  );
}

function bigIntOrZero(value) {
  if (typeof value === "bigint") return value;
  if (typeof value === "number" && Number.isFinite(value)) return BigInt(Math.floor(value));
  if (typeof value === "string" && value) {
    try { return BigInt(value); } catch { return 0n; }
  }
  return 0n;
}
