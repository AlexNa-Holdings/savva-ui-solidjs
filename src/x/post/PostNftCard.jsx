// src/x/post/PostNftCard.jsx
import { Show, createMemo, createResource, createSignal, createEffect, onMount, onCleanup } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";
import NftBadge from "../ui/icons/NftBadge.jsx";
import UserCard from "../ui/UserCard.jsx";
import TokenValue from "../ui/TokenValue.jsx";
import Countdown from "../ui/Countdown.jsx";
import Spinner from "../ui/Spinner.jsx";
import BidAuctionModal from "../modals/BidAuctionModal.jsx";
import { getSavvaContract } from "../../blockchain/contracts.js";
import { pushToast, pushErrorToast } from "../../ui/toast.js";
import { createPublicClient, http, maxUint256 } from "viem";
import { dbg } from "../../utils/debug.js";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

function resolveCid(post) {
  return (
    post?.savva_cid ??
    post?.savvaCid ??
    post?.id ??
    post?.cid ??
    post?.content_cid ??
    post?.ipfs_cid ??
    post?.params?.cid ??
    post?.publishedData?.rootCid ??
    post?.publishedData?.cid ??
    ""
  );
}

function resolveTokenId(post) {
  const cid = resolveCid(post);
  try {
    return BigInt(cid);
  } catch {
    return 0n;
  }
}

async function fetchNftStatusFromChain(app, post) {
  const tokenId = resolveTokenId(post);
  if (!tokenId) {
    dbg.log("PostNftCard", "Invalid token ID");
    return { exists: false };
  }

  try {
    const contentNft = await getSavvaContract(app, "ContentNFT");
    const marketplace = await getSavvaContract(app, "NFTMarketplace");
    const auction = await getSavvaContract(app, "NFTAuction");

    let owner;
    try {
      owner = await contentNft.read.ownerOf([tokenId]);
      if (!owner || owner.toLowerCase() === ZERO_ADDRESS) {
        dbg.log("PostNftCard", "NFT not minted (zero address)");
        return { exists: false };
      }
    } catch (e) {
      const errText = `${e?.shortMessage || ""} ${e?.message || ""}`.toLowerCase();
      const errorName = e?.data?.errorName || e?.errorName;
      const isMissing =
        errText.includes("nonexistent") ||
        errText.includes("invalid token") ||
        errorName === "ERC721NonexistentToken" ||
        e?.code === "CALL_EXCEPTION";
      if (isMissing) {
        dbg.log("PostNftCard", "NFT not minted (not found)");
        return { exists: false };
      }
      throw e;
    }

    const ownerLower = owner.toLowerCase();
    const marketplaceAddr = marketplace.address.toLowerCase();
    const auctionAddr = auction.address.toLowerCase();

    // Check if on marketplace
    if (ownerLower === marketplaceAddr) {
      const listing = await marketplace.read.nfts([tokenId]);
      let sellerAddr = listing.owner;
      let price = listing.price;

      try {
        const ownerOnMarket = await marketplace.read.getNFTOwner([tokenId]);
        if (ownerOnMarket && ownerOnMarket !== ZERO_ADDRESS) sellerAddr = ownerOnMarket;
      } catch (e) {
        dbg.warn?.("PostNftCard:getNFTOwner", e?.message || e);
      }

      try {
        const freshPrice = await marketplace.read.getPrice([tokenId]);
        if (typeof freshPrice === "bigint") price = freshPrice;
      } catch (e) {
        dbg.warn?.("PostNftCard:getPrice", e?.message || e);
      }

      return {
        exists: true,
        on_market: true,
        on_auction: false,
        owner: { address: sellerAddr },
        price: price,
      };
    }

    // Check if on auction
    if (ownerLower === auctionAddr) {
      const auctionRaw = await auction.read.auctions([tokenId]);
      const auctionData = {
        seller: auctionRaw[0],
        startingPrice: auctionRaw[1],
        highestBid: auctionRaw[2],
        highestBidder: auctionRaw[3],
        endTime: auctionRaw[4],
        active: auctionRaw[5],
        bidToken: auctionRaw[6],
      };

      if (!auctionData.active) {
        // Inactive auction, treat as owned by seller
        return {
          exists: true,
          on_market: false,
          on_auction: false,
          owner: { address: auctionData.seller },
          price: 0,
        };
      }

      return {
        exists: true,
        on_market: false,
        on_auction: true,
        owner: { address: auctionData.seller },
        min_bid: auctionData.startingPrice,
        highest_bid: auctionData.highestBid,
        auction_end_time: Number(auctionData.endTime),
      };
    }

    // Just owned
    return {
      exists: true,
      on_market: false,
      on_auction: false,
      owner: { address: owner },
      price: 0,
    };
  } catch (e) {
    dbg.error("PostNftCard:fetchNftStatusFromChain failed", e.shortMessage || e.message);
    return null; // Error state
  }
}

function compareNftData(backendData, chainData) {
  if (!chainData || !chainData.exists) {
    // Chain says NFT doesn't exist but backend has data
    return backendData ? true : false;
  }

  if (!backendData) {
    // Chain has data but backend doesn't
    return true;
  }

  // Compare key fields
  if (backendData.on_market !== chainData.on_market) return true;
  if (backendData.on_auction !== chainData.on_auction) return true;

  // Compare price if on market
  if (chainData.on_market && backendData.price !== chainData.price) return true;

  // Compare auction data if on auction
  if (chainData.on_auction) {
    if (backendData.highest_bid !== chainData.highest_bid) return true;
    if (backendData.auction_end_time !== chainData.auction_end_time) return true;
  }

  // Compare owner address
  const backendOwner = backendData.owner?.address?.toLowerCase();
  const chainOwner = chainData.owner?.address?.toLowerCase();
  if (backendOwner !== chainOwner) return true;

  return false;
}

export default function PostNftCard(props) {
  const app = useApp();

  // Backend NFT data
  const backendNft = () => props.post?.nft;

  // Track if we should hide the card (NFT not actually minted)
  const [shouldHide, setShouldHide] = createSignal(false);

  // Wallet connection status
  const hasWallet = createMemo(() => !!app.actorAddress?.());

  // Fetch NFT status from chain only when wallet is connected
  const [chainNftStatus, { refetch }] = createResource(
    () => hasWallet() && props.post ? { app, post: props.post } : null,
    async ({ app, post }) => await fetchNftStatusFromChain(app, post)
  );

  // Effect to compare and sync data
  createEffect(() => {
    if (!hasWallet()) return; // Only when wallet connected

    const chainData = chainNftStatus();
    if (chainData === undefined) return; // Still loading
    if (chainData === null) return; // Error fetching

    const backendData = backendNft();

    // If chain says NFT doesn't exist, hide the card
    if (!chainData.exists) {
      dbg.log("PostNftCard", "NFT not minted on chain, hiding card");
      setShouldHide(true);

      // Call fix API if backend thinks it exists
      if (backendData) {
        const cid = resolveCid(props.post);
        if (cid) {
          dbg.log("PostNftCard", "Calling fix API for unminted NFT", cid);
          app.wsCall?.("fix", { nft: cid }).catch(err => {
            dbg.warn?.("PostNftCard:fix", "Failed to call fix API", err);
          });
        }
      }
      return;
    }

    // Compare data and call fix if different
    const isDifferent = compareNftData(backendData, chainData);
    if (isDifferent) {
      const cid = resolveCid(props.post);
      if (cid) {
        dbg.log("PostNftCard", "NFT data differs from chain, calling fix API", {
          backend: backendData,
          chain: chainData,
        });
        app.wsCall?.("fix", { nft: cid }).catch(err => {
          dbg.warn?.("PostNftCard:fix", "Failed to call fix API", err);
        });
      }
    }
  });

  // Determine which data to show: chain data if available and wallet connected, otherwise backend
  const displayNft = createMemo(() => {
    if (shouldHide()) return null;

    if (hasWallet()) {
      const chainData = chainNftStatus();
      if (chainData && chainData.exists) {
        return chainData;
      }
    }

    return backendNft();
  });

  // Check if we should show the card
  const hasNft = createMemo(() => {
    if (shouldHide()) return false;

    const nftData = displayNft();
    if (!nftData) return false;

    // NFT exists if it has an owner or is on market/auction
    return !!(nftData.owner || nftData.on_market || nftData.on_auction);
  });

  const savvaTokenAddress = createMemo(() => app.info?.()?.savva_contracts?.SavvaToken?.address || "");

  // Auction-specific state
  const [auctionEnded, setAuctionEnded] = createSignal(false);
  const [finalizingAuction, setFinalizingAuction] = createSignal(false);
  const [showBidModal, setShowBidModal] = createSignal(false);

  // Market-specific state
  const [buyingNft, setBuyingNft] = createSignal(false);

  const isAuctionEnded = createMemo(() => {
    const nftData = displayNft();
    if (!nftData?.on_auction || !nftData.auction_end_time) return false;
    const now = Math.floor(Date.now() / 1000);
    return nftData.auction_end_time <= now || auctionEnded();
  });

  // Fetch seller profile
  const [sellerProfile] = createResource(
    () => {
      const nftData = displayNft();
      const addr = nftData?.owner?.address;
      const domain = app.selectedDomainName?.();
      if (!addr || !domain) return null;
      return { addr, domain };
    },
    async (params) => {
      if (!params) return null;
      try {
        const res = await app.wsCall?.("get-user", { domain: params.domain, user_addr: params.addr });
        if (!res) return { address: params.addr };
        return { ...res, address: res.address || params.addr };
      } catch (e) {
        dbg.warn?.("PostNftCard:sellerProfile", e?.message || e);
        return { address: params.addr };
      }
    }
  );

  const sellerUser = createMemo(() => {
    const nftData = displayNft();
    const addr = nftData?.owner?.address;
    if (!addr) return null;
    const profile = sellerProfile();
    return profile ? profile : { address: addr };
  });

  // Fetch highest bidder profile (for auction)
  const [highestBidderProfile] = createResource(
    () => {
      const nftData = displayNft();
      if (!nftData?.on_auction) return null;
      const bidderAddr = nftData.owner?.address; // Note: backend sends highest bidder in a different field if exists
      const domain = app.selectedDomainName?.();
      // Check if there's actually a bid (highest_bid > 0)
      if (!bidderAddr || !domain || !nftData.highest_bid || nftData.highest_bid === 0) return null;
      return { addr: bidderAddr, domain };
    },
    async (params) => {
      if (!params) return null;
      try {
        const res = await app.wsCall?.("get-user", { domain: params.domain, user_addr: params.addr });
        if (!res) return { address: params.addr };
        return { ...res, address: res.address || params.addr };
      } catch (e) {
        dbg.warn?.("PostNftCard:bidderProfile", e?.message || e);
        return { address: params.addr };
      }
    }
  );

  const highestBidderUser = createMemo(() => {
    const nftData = displayNft();
    if (!nftData?.on_auction || !nftData.highest_bid || nftData.highest_bid === 0) return null;
    const profile = highestBidderProfile();
    return profile;
  });

  async function handleFinalizeAuction() {
    if (finalizingAuction()) return;

    const tokenId = resolveTokenId(props.post);
    if (!tokenId) {
      pushErrorToast(new Error("Invalid NFT token ID"));
      return;
    }

    const chain = app.desiredChain?.();
    const rpc = chain?.rpcUrls?.[0];
    if (!chain || !rpc) {
      pushErrorToast(new Error("Network not configured"));
      return;
    }

    setFinalizingAuction(true);
    const pendingToastId = pushToast({
      type: "info",
      message: app.t("nft.auction.finalize.toast.pending") || "Finalizing auction…",
      autohideMs: 0,
    });

    try {
      const publicClient = createPublicClient({ chain, transport: http(rpc) });
      const auctionContract = await getSavvaContract(app, "NFTAuction", { write: true });
      const txHash = await auctionContract.write.finalizeAuction([tokenId]);
      await publicClient.waitForTransactionReceipt({ hash: txHash });
      app.dismissToast?.(pendingToastId);
      pushToast({
        type: "success",
        message: app.t("nft.auction.finalize.toast.success") || "Auction finalized successfully."
      });

      // Refetch chain data to update UI
      await refetch();
    } catch (err) {
      app.dismissToast?.(pendingToastId);
      pushErrorToast(err, {
        context: app.t("nft.auction.finalize.toast.error") || "Failed to finalize auction."
      });
      dbg.error?.("PostNftCard:finalizeAuction", err);
    } finally {
      setFinalizingAuction(false);
    }
  }

  async function handleBid() {
    setShowBidModal(true);
  }

  const handleBidSuccess = async () => {
    // Refetch chain data to update UI
    await refetch();
  };

  // Listen for NFT update events
  onMount(() => {
    const handleNftUpdate = (event) => {
      const { contentId, eventType } = event.detail || {};
      const currentCid = resolveCid(props.post);

      // Only refetch if this event is for our NFT
      if (contentId && currentCid && String(contentId) === String(currentCid)) {
        dbg.log("PostNftCard", `Received ${eventType} event, refetching data`);
        refetch();
      }
    };

    window.addEventListener("nft-update", handleNftUpdate);
    onCleanup(() => {
      window.removeEventListener("nft-update", handleNftUpdate);
    });
  });

  async function handleBuy() {
    if (buyingNft()) return;

    const nftData = displayNft();
    const price = nftData?.price;
    if (!price || price === 0n || price === 0) {
      pushErrorToast(new Error("Invalid NFT price"));
      return;
    }

    const tokenId = resolveTokenId(props.post);
    if (!tokenId) {
      pushErrorToast(new Error("Invalid NFT token ID"));
      return;
    }

    const chain = app.desiredChain?.();
    const rpc = chain?.rpcUrls?.[0];
    if (!chain || !rpc) {
      pushErrorToast(new Error("Network not configured"));
      return;
    }

    const tokenAddress = savvaTokenAddress();
    if (!tokenAddress) {
      pushErrorToast(new Error("Token address not found"));
      return;
    }

    setBuyingNft(true);
    let currentToastId = pushToast({
      type: "info",
      message: app.t("nft.market.buy.toast.pending") || "Processing purchase…",
      autohideMs: 0,
    });

    try {
      const publicClient = createPublicClient({ chain, transport: http(rpc) });
      const savvaToken = await getSavvaContract(app, "SavvaToken", { write: true });
      const marketplace = await getSavvaContract(app, "NFTMarketplace", { write: true });
      const actorAddr = app.actorAddress?.();

      // Check allowance
      const priceBigInt = BigInt(price);
      const allowance = await savvaToken.read.allowance([actorAddr, marketplace.address]);

      if (allowance < priceBigInt) {
        // Request approval
        app.dismissToast?.(currentToastId);
        currentToastId = pushToast({
          type: "info",
          message: app.t("nft.market.buy.toast.approving") || "Approving token spend…",
          autohideMs: 0,
        });

        const approveTxHash = await savvaToken.write.approve([marketplace.address, maxUint256]);
        await publicClient.waitForTransactionReceipt({ hash: approveTxHash });

        app.dismissToast?.(currentToastId);
        currentToastId = pushToast({
          type: "info",
          message: app.t("nft.market.buy.toast.buying") || "Purchasing NFT…",
          autohideMs: 0,
        });

        // Buy NFT
        const buyTxHash = await marketplace.write.buy([tokenId, priceBigInt]);
        await publicClient.waitForTransactionReceipt({ hash: buyTxHash });
        app.dismissToast?.(currentToastId);
      } else {
        // Buy NFT directly
        app.dismissToast?.(currentToastId);
        currentToastId = pushToast({
          type: "info",
          message: app.t("nft.market.buy.toast.buying") || "Purchasing NFT…",
          autohideMs: 0,
        });

        const buyTxHash = await marketplace.write.buy([tokenId, priceBigInt]);
        await publicClient.waitForTransactionReceipt({ hash: buyTxHash });
        app.dismissToast?.(currentToastId);
      }

      pushToast({
        type: "success",
        message: app.t("nft.market.buy.toast.success") || "NFT purchased successfully!"
      });

      // Refetch chain data to update UI
      await refetch();
    } catch (err) {
      app.dismissToast?.(currentToastId);
      pushErrorToast(err, {
        context: app.t("nft.market.buy.toast.error") || "Failed to purchase NFT."
      });
      dbg.error?.("PostNftCard:buy", err);
    } finally {
      setBuyingNft(false);
    }
  }

  return (
    <Show when={hasNft()}>
      <div
        class="rounded-lg p-4 bg-[hsl(var(--card))] text-[hsl(var(--card-foreground))] shadow-sm space-y-3 flex flex-col"
        aria-label="NFT Information"
      >
        {/* NFT Badge as header */}
        <div class="flex justify-center">
          <NftBadge class="w-12 h-12" />
        </div>

        <Show when={displayNft()?.on_auction}>
          {/* Auction Mode */}
          <div class="space-y-3">
            <h4 class="font-semibold uppercase text-center text-sm">
              {app.t("nft.auction.title") || "Auction"}
            </h4>

            {/* Seller */}
            <div class="space-y-1">
              <div class="text-xs text-[hsl(var(--muted-foreground))] text-center">
                {app.t("nft.auction.seller") || "Seller"}
              </div>
              <div class="flex justify-center">
                <Show when={sellerUser()} fallback={<Spinner class="w-4 h-4" />}>
                  <UserCard author={sellerUser()} centered />
                </Show>
              </div>
            </div>

            {/* Current status: either starting price or current winner */}
            <Show
              when={highestBidderUser()}
              fallback={
                <div class="space-y-1">
                  <div class="text-xs text-[hsl(var(--muted-foreground))] text-center">
                    {app.t("nft.auction.startingPrice") || "Starting Price"}
                  </div>
                  <div class="flex justify-center">
                    <TokenValue
                      amount={displayNft()?.min_bid ?? 0n}
                      tokenAddress={savvaTokenAddress()}
                      centered
                    />
                  </div>
                </div>
              }
            >
              <div class="space-y-2">
                <div class="text-xs text-[hsl(var(--muted-foreground))] text-center">
                  {app.t("nft.auction.currentWinner") || "Current Winner"}
                </div>
                <div class="flex justify-center">
                  <UserCard author={highestBidderUser()} centered />
                </div>
                <div class="flex justify-center">
                  <TokenValue
                    amount={displayNft()?.highest_bid ?? 0n}
                    tokenAddress={savvaTokenAddress()}
                    centered
                  />
                </div>
              </div>
            </Show>

            {/* Countdown */}
            <div class="space-y-1">
              <div class="text-xs text-[hsl(var(--muted-foreground))] text-center">
                {app.t("nft.auction.endsIn") || "Auction ends in"}
              </div>
              <div class="flex justify-center">
                <Countdown
                  targetTs={displayNft()?.auction_end_time ?? 0}
                  size="sm"
                  labelPosition="top"
                  labelStyle="short"
                  onDone={() => setAuctionEnded(true)}
                />
              </div>
            </div>

            {/* Action button */}
            <div class="pt-2">
              <Show
                when={isAuctionEnded()}
                fallback={
                  <button
                    onClick={handleBid}
                    class="w-full px-4 py-2 rounded bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90 text-sm font-semibold"
                  >
                    {app.t("nft.auction.bid") || "Bid"}
                  </button>
                }
              >
                <button
                  onClick={handleFinalizeAuction}
                  disabled={finalizingAuction()}
                  class={`w-full px-4 py-2 rounded bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] text-sm font-semibold ${finalizingAuction() ? "opacity-70" : "hover:opacity-90"}`}
                >
                  <Show when={finalizingAuction()} fallback={app.t("nft.auction.finalize") || "Finalize Auction"}>
                    <Spinner class="w-4 h-4" />
                  </Show>
                </button>
              </Show>
            </div>
          </div>
        </Show>

        {/* Simple Owned Mode - not on market, not on auction */}
        <Show when={!displayNft()?.on_auction && !displayNft()?.on_market}>
          <div class="space-y-3">
            {/* Owner */}
            <div class="space-y-1">
              <div class="text-xs text-[hsl(var(--muted-foreground))] text-center">
                {app.t("nft.owner") || "Owner"}
              </div>
              <div class="flex justify-center">
                <Show when={sellerUser()} fallback={<Spinner class="w-4 h-4" />}>
                  <UserCard author={sellerUser()} centered />
                </Show>
              </div>
            </div>
          </div>
        </Show>

        {/* Market Mode - NFT is on sale */}
        <Show when={displayNft()?.on_market}>
          <div class="space-y-3">
            <h4 class="font-semibold uppercase text-center text-sm">
              {app.t("nft.market.title") || "For Sale"}
            </h4>

            {/* Seller */}
            <div class="space-y-1">
              <div class="text-xs text-[hsl(var(--muted-foreground))] text-center">
                {app.t("nft.market.seller") || "Seller"}
              </div>
              <div class="flex justify-center">
                <Show when={sellerUser()} fallback={<Spinner class="w-4 h-4" />}>
                  <UserCard author={sellerUser()} centered />
                </Show>
              </div>
            </div>

            {/* Price */}
            <div class="space-y-1">
              <div class="text-xs text-[hsl(var(--muted-foreground))] text-center">
                {app.t("nft.market.price") || "Price"}
              </div>
              <div class="flex justify-center">
                <TokenValue
                  amount={displayNft()?.price ?? 0n}
                  tokenAddress={savvaTokenAddress()}
                  centered
                />
              </div>
            </div>

            {/* Buy button */}
            <div class="pt-2">
              <button
                onClick={handleBuy}
                disabled={buyingNft()}
                class={`w-full px-4 py-2 rounded bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] text-sm font-semibold ${buyingNft() ? "opacity-70" : "hover:opacity-90"}`}
              >
                <Show when={buyingNft()} fallback={app.t("nft.market.buy") || "Buy"}>
                  <Spinner class="w-4 h-4" />
                </Show>
              </button>
            </div>
          </div>
        </Show>
      </div>

      {/* Bid Modal */}
      <BidAuctionModal
        isOpen={showBidModal()}
        onClose={() => setShowBidModal(false)}
        tokenId={resolveTokenId(props.post)}
        auctionData={displayNft()}
        onSuccess={handleBidSuccess}
      />
    </Show>
  );
}
