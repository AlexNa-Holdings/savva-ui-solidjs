// src/x/modals/BidAuctionModal.jsx
import { Show, createSignal, createMemo, createResource, createEffect } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";
import Modal from "./Modal.jsx";
import AmountInput from "../ui/AmountInput.jsx";
import Spinner from "../ui/Spinner.jsx";
import TokenValue from "../ui/TokenValue.jsx";
import { getConfigParam } from "../../blockchain/config.js";
import { getSavvaContract } from "../../blockchain/contracts.js";
import { pushToast, pushErrorToast } from "../../ui/toast.js";
import { createPublicClient, http, maxUint256, formatUnits } from "viem";
import { dbg } from "../../utils/debug.js";

export default function BidAuctionModal(props) {
  const app = useApp();
  const { t } = app;

  const [bidAmountText, setBidAmountText] = createSignal("");
  const [bidAmountWei, setBidAmountWei] = createSignal(0n);
  const [isSubmitting, setIsSubmitting] = createSignal(false);
  const [initialized, setInitialized] = createSignal(false);

  const savvaTokenAddress = createMemo(() => app.info?.()?.savva_contracts?.SavvaToken?.address || "");
  const chain = createMemo(() => app.desiredChain?.());
  const rpcUrl = createMemo(() => chain()?.rpcUrls?.[0]);

  // Fetch config params
  const [minIncrementRes] = createResource(
    () => app.selectedDomainName?.() || "",
    async () => await getConfigParam(app, "nft_auction_min_increment")
  );

  const [maxIncrementRes] = createResource(
    () => app.selectedDomainName?.() || "",
    async () => await getConfigParam(app, "nft_auction_max_increment")
  );

  const minIncrement = createMemo(() => {
    const val = minIncrementRes();
    if (typeof val === "bigint") return val;
    if (typeof val === "number") return BigInt(Math.floor(val));
    return 0n;
  });

  const maxIncrement = createMemo(() => {
    const val = maxIncrementRes();
    if (typeof val === "bigint") return val;
    if (typeof val === "number") return BigInt(Math.floor(val));
    return 0n;
  });

  // Calculate min and max bid amounts
  const minBidAmount = createMemo(() => {
    const auction = props.auctionData;
    if (!auction) return 0n;

    const minInc = minIncrement();
    if (minInc === 0n) return 0n;

    // If no bids yet, minimum is the starting price
    if (!auction.highest_bid || auction.highest_bid === 0n || auction.highest_bid === 0) {
      return BigInt(auction.min_bid || 0);
    }

    // Otherwise, minimum is highest_bid + (highest_bid * min_increment / 100)
    const highestBid = BigInt(auction.highest_bid);
    const increment = (highestBid * minInc) / 100n;
    return highestBid + increment;
  });

  const maxBidAmount = createMemo(() => {
    const auction = props.auctionData;
    if (!auction) return 0n;

    const maxInc = maxIncrement();
    if (maxInc === 0n) return 0n;

    // If no bids yet, maximum is starting_price + (starting_price * max_increment / 100)
    if (!auction.highest_bid || auction.highest_bid === 0n || auction.highest_bid === 0) {
      const startingPrice = BigInt(auction.min_bid || 0);
      const increment = (startingPrice * maxInc) / 100n;
      return startingPrice + increment;
    }

    // Otherwise, maximum is highest_bid + (highest_bid * max_increment / 100)
    const highestBid = BigInt(auction.highest_bid);
    const increment = (highestBid * maxInc) / 100n;
    return highestBid + increment;
  });

  const configLoading = createMemo(() => minIncrementRes.loading || maxIncrementRes.loading);
  const isValid = createMemo(() => {
    const amount = bidAmountWei();
    const min = minBidAmount();
    const max = maxBidAmount();
    return amount > 0n && amount >= min && amount <= max;
  });

  // Pre-fill minimum bid amount when modal opens
  createEffect(() => {
    if (props.isOpen && !initialized() && !configLoading()) {
      const minBid = minBidAmount();
      if (minBid > 0n) {
        // Convert wei to human-readable format (18 decimals)
        const minBidFormatted = formatUnits(minBid, 18);
        setBidAmountText(minBidFormatted);
        setBidAmountWei(minBid);
        setInitialized(true);
      }
    }

    // Reset initialized when modal closes
    if (!props.isOpen && initialized()) {
      setInitialized(false);
    }
  });

  const handleClose = () => {
    if (!isSubmitting()) {
      setBidAmountText("");
      setBidAmountWei(0n);
      setInitialized(false);
      props.onClose?.();
    }
  };

  const handleSubmit = async (e) => {
    e?.preventDefault();
    if (!isValid() || isSubmitting()) return;

    const chainValue = chain();
    const rpc = rpcUrl();
    if (!chainValue || !rpc) {
      pushErrorToast(new Error("Network not configured"));
      return;
    }

    const tokenAddress = savvaTokenAddress();
    if (!tokenAddress) {
      pushErrorToast(new Error("Token address not found"));
      return;
    }

    setIsSubmitting(true);
    let currentToastId = pushToast({
      type: "info",
      message: t("nft.auction.bid.toast.pending") || "Processing bid…",
      autohideMs: 0,
    });

    try {
      const publicClient = createPublicClient({ chain: chainValue, transport: http(rpc) });
      const savvaToken = await getSavvaContract(app, "SavvaToken", { write: true });
      const auctionContract = await getSavvaContract(app, "NFTAuction", { write: true });
      const actorAddr = app.actorAddress?.();

      // Check allowance
      const allowance = await savvaToken.read.allowance([actorAddr, auctionContract.address]);
      const bidAmount = bidAmountWei();

      if (allowance < bidAmount) {
        // Request approval
        app.dismissToast?.(currentToastId);
        currentToastId = pushToast({
          type: "info",
          message: t("nft.auction.bid.toast.approving") || "Approving token spend…",
          autohideMs: 0,
        });

        const approveTxHash = await savvaToken.write.approve([auctionContract.address, maxUint256]);
        await publicClient.waitForTransactionReceipt({ hash: approveTxHash });

        app.dismissToast?.(currentToastId);
        currentToastId = pushToast({
          type: "info",
          message: t("nft.auction.bid.toast.placing") || "Placing bid…",
          autohideMs: 0,
        });

        // Place bid
        const bidTxHash = await auctionContract.write.placeBid([
          props.tokenId,
          bidAmount,
          tokenAddress
        ]);
        await publicClient.waitForTransactionReceipt({ hash: bidTxHash });
        app.dismissToast?.(currentToastId);
      } else {
        // Place bid directly
        app.dismissToast?.(currentToastId);
        currentToastId = pushToast({
          type: "info",
          message: t("nft.auction.bid.toast.placing") || "Placing bid…",
          autohideMs: 0,
        });

        const bidTxHash = await auctionContract.write.placeBid([
          props.tokenId,
          bidAmount,
          tokenAddress
        ]);
        await publicClient.waitForTransactionReceipt({ hash: bidTxHash });
        app.dismissToast?.(currentToastId);
      }

      pushToast({
        type: "success",
        message: t("nft.auction.bid.toast.success") || "Bid placed successfully!"
      });

      // Reset form and close modal
      setBidAmountText("");
      setBidAmountWei(0n);
      setInitialized(false);
      setIsSubmitting(false);

      props.onSuccess?.();
      props.onClose?.();
    } catch (err) {
      app.dismissToast?.(currentToastId);
      pushErrorToast(err, {
        context: t("nft.auction.bid.toast.error") || "Failed to place bid."
      });
      dbg.error?.("BidAuctionModal:submit", err);
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={props.isOpen}
      onClose={handleClose}
      title={t("nft.auction.bid.title") || "Place Bid"}
      size="sm"
    >
      <Show when={configLoading()} fallback={
        <form onSubmit={handleSubmit} class="space-y-4">
          {/* Min/Max info */}
          <div class="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted))] p-3 space-y-2 text-sm">
            <div class="flex justify-between">
              <span class="text-[hsl(var(--muted-foreground))]">
                {t("nft.auction.bid.minimum") || "Minimum bid"}:
              </span>
              <TokenValue amount={minBidAmount()} tokenAddress={savvaTokenAddress()} />
            </div>
            <div class="flex justify-between">
              <span class="text-[hsl(var(--muted-foreground))]">
                {t("nft.auction.bid.maximum") || "Maximum bid"}:
              </span>
              <TokenValue amount={maxBidAmount()} tokenAddress={savvaTokenAddress()} />
            </div>
          </div>

          {/* Bid amount input */}
          <div class="space-y-2">
            <AmountInput
              label={t("nft.auction.bid.amount") || "Your bid"}
              tokenAddress={savvaTokenAddress()}
              value={bidAmountText()}
              onChange={(payload) => {
                setBidAmountText(payload?.text ?? "");
                setBidAmountWei(payload?.amountWei ?? 0n);
              }}
            />
          </div>

          {/* Validation message */}
          <Show when={bidAmountWei() > 0n && !isValid()}>
            <p class="text-xs text-[hsl(var(--destructive))]">
              {t("nft.auction.bid.invalidAmount") || "Bid amount must be between minimum and maximum."}
            </p>
          </Show>

          {/* Submit button */}
          <div class="flex gap-2 justify-end">
            <button
              type="button"
              onClick={handleClose}
              disabled={isSubmitting()}
              class="px-4 py-2 rounded-lg text-sm font-medium hover:bg-[hsl(var(--muted))]"
            >
              {t("common.cancel") || "Cancel"}
            </button>
            <button
              type="submit"
              disabled={!isValid() || isSubmitting()}
              class={`px-4 py-2 rounded-lg text-sm font-medium text-[hsl(var(--primary-foreground))] bg-[hsl(var(--primary))] ${!isValid() || isSubmitting() ? "opacity-60" : "hover:opacity-90"}`}
            >
              <Show when={isSubmitting()} fallback={t("nft.auction.bid.submit") || "Place Bid"}>
                <Spinner class="w-4 h-4" />
              </Show>
            </button>
          </div>
        </form>
      }>
        <div class="flex justify-center py-8">
          <Spinner />
        </div>
      </Show>
    </Modal>
  );
}
