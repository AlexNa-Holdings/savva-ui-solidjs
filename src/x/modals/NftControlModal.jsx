// src/x/modals/NftControlModal.jsx
import { Show, createMemo, createResource, createSignal, Switch, Match } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";
import Modal from "./Modal.jsx";
import NftOwnerOptions from "../promote/NftOwnerOptions.jsx";
import { getSavvaContract } from "../../blockchain/contracts.js";
import Spinner from "../ui/Spinner.jsx";
import UserCard from "../ui/UserCard.jsx";
import TokenValue from "../ui/TokenValue.jsx";
import Countdown from "../ui/Countdown.jsx";
import IpfsImage from "../ui/IpfsImage.jsx";
import { ipfs } from "../../ipfs/index.js";
import { pushToast, pushErrorToast } from "../../ui/toast.js";
import { createPublicClient, http } from "viem";
import { dbg } from "../../utils/debug.js";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

async function fetchNftStatus(app, tokenId) {
  if (!tokenId) return { state: "error", message: "Invalid token ID" };

  try {
    const contentNft = await getSavvaContract(app, "ContentNFT");
    const marketplace = await getSavvaContract(app, "NFTMarketplace");
    const auction = await getSavvaContract(app, "NFTAuction");

    let owner;
    try {
      owner = await contentNft.read.ownerOf([tokenId]);
      if (!owner || owner.toLowerCase() === ZERO_ADDRESS) {
        return { state: "error", message: "NFT not found" };
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
        return { state: "error", message: "NFT not found" };
      }
      throw e;
    }

    const tokenURI = await contentNft.read.tokenURI([tokenId]);

    const ownerLower = owner.toLowerCase();
    const marketplaceAddr = marketplace.address.toLowerCase();
    const auctionAddr = auction.address.toLowerCase();

    if (ownerLower === marketplaceAddr) {
      const listing = await marketplace.read.nfts([tokenId]);
      let sellerAddr = listing.owner;
      try {
        const ownerOnMarket = await marketplace.read.getNFTOwner([tokenId]);
        if (ownerOnMarket && ownerOnMarket !== ZERO_ADDRESS) sellerAddr = ownerOnMarket;
      } catch (e) {
        dbg.warn?.("NftControlModal:getNFTOwner", e?.message || e);
      }

      let price = listing.price;
      try {
        const freshPrice = await marketplace.read.getPrice([tokenId]);
        if (typeof freshPrice === "bigint") price = freshPrice;
      } catch (e) {
        dbg.warn?.("NftControlModal:getPrice", e?.message || e);
      }

      return {
        state: "on_sale",
        tokenId,
        tokenURI,
        seller: sellerAddr,
        price,
      };
    }

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
        return { state: "owned", tokenId, tokenURI, owner: auctionData.seller };
      }
      return {
        state: "on_auction",
        tokenId,
        tokenURI,
        seller: auctionData.seller,
        auction: auctionData,
      };
    }

    return { state: "owned", tokenId, tokenURI, owner: owner };
  } catch (e) {
    dbg.error("NftControlModal:fetchNftStatus failed", e.shortMessage || e.message);
    return { state: "error", message: e.shortMessage || e.message };
  }
}

function NftInfoPanel(props) {
  const app = useApp();
  const { t } = app;

  const loading = createMemo(() => (typeof props.loading === "function" ? props.loading() : !!props.loading));
  const metadata = createMemo(() => (typeof props.metadata === "function" ? props.metadata() : props.metadata));
  const owner = createMemo(() => (typeof props.owner === "function" ? props.owner() : props.owner));
  const imageSrc = createMemo(() => props.image ?? metadata()?.image ?? "");
  const title = createMemo(() => props.title ?? metadata()?.name ?? "");
  const subtitle = createMemo(() => props.subtitle ?? "");
  const ownerLabel = createMemo(() => props.ownerLabel || (t("nft.owner") || "Owner"));
  const subtitleClass = () => props.subtitleClass || "pt-2";

  return (
    <div class="space-y-3 w-full max-w-[250px] mx-auto text-center">
      <Show when={loading()} fallback={
        <>
          <Show when={title()}>
            <h4 class="text-lg font-bold leading-tight line-clamp-3 break-words">
              {title()}
            </h4>
          </Show>

          <div class="mx-auto flex h-[150px] w-[200px] items-center justify-center rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted))]">
            <Show when={imageSrc()} fallback={<span class="text-xs text-[hsl(var(--muted-foreground))]">No preview</span>}>
              <IpfsImage src={imageSrc()} class="w-full h-full object-cover rounded-lg" />
            </Show>
          </div>

          <Show when={subtitle()}>
            <p class={`text-sm ${subtitleClass()}`}>{subtitle()}</p>
          </Show>

          <div class="text-sm text-[hsl(var(--muted-foreground))] mt-2">{ownerLabel()}:</div>
          <div class="flex justify-center">
            <Show when={owner()} fallback={<span class="text-xs text-[hsl(var(--muted-foreground))]">{t("nft.owner.loadingOwner") || "Loading owner…"}</span>}>
              <UserCard author={owner()} centered />
            </Show>
          </div>
        </>
      }>
        <div class="pt-2"><Spinner /></div>
      </Show>
    </div>
  );
}

export default function NftControlModal(props) {
  const app = useApp();
  const { t } = app;

  const [nftStatus, { refetch: refetchNftStatus }] = createResource(
    () => props.tokenId,
    async (tokenId) => await fetchNftStatus(app, tokenId)
  );

  const [nftMetadata] = createResource(
    () => nftStatus()?.tokenURI,
    async (uri) => {
      if (!uri) return null;
      try {
        if (uri.startsWith("ipfs://")) {
          const cid = uri.substring(7);
          const { data } = await ipfs.getJSONBest(app, cid);
          return data;
        }
        if (uri.startsWith("https://") || uri.startsWith("http://")) {
          const res = await fetch(uri);
          if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
          return await res.json();
        }
        return { error: "Unsupported tokenURI format", uri };
      } catch (e) {
        dbg.error("NftControlModal:fetchMetadata failed", e);
        return { error: e.message };
      }
    }
  );

  const isActorOwner = createMemo(() => {
    const status = nftStatus();
    const actor = app.actorAddress?.()?.toLowerCase();
    if (!actor || !status) return false;

    if (status.state === "owned") return status.owner?.toLowerCase() === actor;
    if (status.state === "on_sale" || status.state === "on_auction") {
      return status.seller?.toLowerCase() === actor;
    }
    return false;
  });

  const ownerAddress = createMemo(() => {
    const status = nftStatus();
    if (!status) return "";
    if (status.state === "owned") return status.owner || "";
    if (status.state === "on_sale" || status.state === "on_auction") return status.seller || "";
    return "";
  });

  const [ownerProfile] = createResource(
    () => {
      const addr = ownerAddress();
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
        dbg.warn?.("NftControlModal:ownerProfile", e?.message || e);
        return { address: params.addr };
      }
    }
  );

  const ownerUser = createMemo(() => {
    const addr = ownerAddress();
    if (!addr) return null;
    const profile = ownerProfile();
    return profile ? profile : { address: addr };
  });

  const highestBidderAddress = createMemo(() => {
    const status = nftStatus();
    if (status?.state !== "on_auction") return "";
    const bidder = status.auction?.highestBidder;
    if (!bidder || bidder === ZERO_ADDRESS) return "";
    return bidder;
  });

  const [highestBidderProfile] = createResource(
    () => {
      const addr = highestBidderAddress();
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
        dbg.warn?.("NftControlModal:highestBidderProfile", e?.message || e);
        return { address: params.addr };
      }
    }
  );

  const highestBidderUser = createMemo(() => {
    const addr = highestBidderAddress();
    if (!addr) return null;
    const profile = highestBidderProfile();
    return profile ? profile : { address: addr };
  });

  const savvaTokenAddress = createMemo(() => app.info?.()?.savva_contracts?.SavvaToken?.address || "");
  const summaryImage = createMemo(() => nftMetadata()?.image || "");
  const desiredChain = createMemo(() => app.desiredChain?.());

  const [isRemoving, setIsRemoving] = createSignal(false);
  const [finalizingAuction, setFinalizingAuction] = createSignal(false);
  const [auctionEnded, setAuctionEnded] = createSignal(false);

  const isAuctionEnded = createMemo(() => {
    const status = nftStatus();
    if (status?.state !== "on_auction" || !status.auction?.endTime) return false;
    const now = Math.floor(Date.now() / 1000);
    return Number(status.auction.endTime) <= now || auctionEnded();
  });

  const handleOwnerActionComplete = async () => {
    try {
      await refetchNftStatus();
      props.onActionComplete?.();
    } catch (err) {
      dbg.warn?.("NftControlModal:refetch", err?.message || err);
    }
  };

  async function handleRemoveFromMarket() {
    if (isRemoving()) return;
    const status = nftStatus();
    if (!status?.tokenId) return;

    const chain = desiredChain();
    const rpc = chain?.rpcUrls?.[0];
    if (!chain || !rpc) {
      pushErrorToast(new Error("Network not configured"));
      return;
    }

    setIsRemoving(true);
    const pendingToastId = pushToast({
      type: "info",
      message: t("nft.owner.sale.remove.toast.pending") || "Submitting removal transaction…",
      autohideMs: 0,
    });

    try {
      const publicClient = createPublicClient({ chain, transport: http(rpc) });
      const marketplace = await getSavvaContract(app, "NFTMarketplace", { write: true });
      const txHash = await marketplace.write.removeFromMarket([status.tokenId]);
      await publicClient.waitForTransactionReceipt({ hash: txHash });
      app.dismissToast?.(pendingToastId);
      pushToast({ type: "success", message: t("nft.owner.sale.remove.toast.success") || "NFT removed from market." });
      await handleOwnerActionComplete();
    } catch (err) {
      app.dismissToast?.(pendingToastId);
      pushErrorToast(err, { context: t("nft.owner.sale.remove.toast.error") || "Failed to remove NFT from market." });
      dbg.error?.("NftControlModal:removeFromMarket", err);
    } finally {
      setIsRemoving(false);
    }
  }

  async function handleFinalizeAuction() {
    if (finalizingAuction()) return;
    const status = nftStatus();
    if (!status?.tokenId) return;

    const chain = desiredChain();
    const rpc = chain?.rpcUrls?.[0];
    if (!chain || !rpc) {
      pushErrorToast(new Error("Network not configured"));
      return;
    }

    setFinalizingAuction(true);
    const pendingToastId = pushToast({
      type: "info",
      message: t("nft.auction.finalize.toast.pending") || "Finalizing auction…",
      autohideMs: 0,
    });

    try {
      const publicClient = createPublicClient({ chain, transport: http(rpc) });
      const auctionContract = await getSavvaContract(app, "NFTAuction", { write: true });
      const txHash = await auctionContract.write.finalizeAuction([status.tokenId]);
      await publicClient.waitForTransactionReceipt({ hash: txHash });
      app.dismissToast?.(pendingToastId);
      pushToast({ type: "success", message: t("nft.auction.finalize.toast.success") || "Auction finalized successfully." });
      await handleOwnerActionComplete();
    } catch (err) {
      app.dismissToast?.(pendingToastId);
      pushErrorToast(err, { context: t("nft.auction.finalize.toast.error") || "Failed to finalize auction." });
      dbg.error?.("NftControlModal:finalizeAuction", err);
    } finally {
      setFinalizingAuction(false);
    }
  }

  const handleActionComplete = async () => {
    await handleOwnerActionComplete();
  };

  return (
    <Modal
      isOpen={props.isOpen}
      onClose={props.onClose}
      title={app.t("nft.control.title") || "Manage NFT"}
      size="4xl-fixed"
    >
      <div class="bg-[hsl(var(--background))] min-h-[500px]">
        <Show when={nftStatus.loading}>
          <div class="flex justify-center p-8"><Spinner /></div>
        </Show>

        <Show when={!nftStatus.loading && nftStatus()}>
          <Switch>
            <Match when={nftStatus().state === 'error'}>
              <div class="p-6">
                <p class="text-center text-sm text-[hsl(var(--destructive))]">{nftStatus().message}</p>
              </div>
            </Match>

            <Match when={nftStatus().state === 'on_sale'}>
              <div class="grid grid-cols-1 gap-8 md:grid-cols-[250px_minmax(0,1fr)] items-start p-6">
                <NftInfoPanel
                  loading={nftMetadata.loading}
                  metadata={nftMetadata}
                  image={summaryImage()}
                  ownerLabel={t("nft.owner.sale.listedBy") || "Listed by"}
                  owner={ownerUser}
                />
                <div class="space-y-4 text-center">
                  <Show when={isActorOwner()} fallback={<p class="text-sm text-[hsl(var(--muted-foreground))]">{t("nft.owner.sale.notSeller") || "Only the seller can manage this listing."}</p>}>
                    <h3 class="text-base font-semibold">{t("nft.owner.sale.subtitle") || "This NFT is currently on sale."}</h3>
                    <div class="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 space-y-2">
                      <div class="text-sm text-[hsl(var(--muted-foreground))]">{t("nft.owner.sale.currentPrice") || "Current price"}</div>
                      <TokenValue amount={nftStatus().price ?? 0n} tokenAddress={savvaTokenAddress() || undefined} centered />
                    </div>
                    <div class="flex justify-center">
                      <button
                        type="button"
                        onClick={handleRemoveFromMarket}
                        disabled={isRemoving()}
                        class={`inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium text-[hsl(var(--destructive-foreground))] bg-[hsl(var(--destructive))] ${isRemoving() ? "opacity-70" : "hover:opacity-90"}`}
                      >
                        <Show when={isRemoving()} fallback={t("nft.owner.sale.remove") || "Remove from Market"}>
                          <Spinner class="w-4 h-4" />
                        </Show>
                      </button>
                    </div>
                  </Show>
                </div>
              </div>
            </Match>

            <Match when={nftStatus().state === 'on_auction'}>
              <div class="grid grid-cols-1 gap-8 md:grid-cols-[250px_minmax(0,1fr)] items-start p-6">
                <NftInfoPanel
                  loading={nftMetadata.loading}
                  metadata={nftMetadata}
                  image={summaryImage()}
                  subtitle={t("nft.owner.auction.subtitle") || "This NFT is currently on auction."}
                  subtitleClass="pt-2 font-semibold"
                  ownerLabel={t("nft.owner.auction.createdBy") || "Auction created by"}
                  owner={ownerUser}
                />
                <div class="space-y-4">
                  <h3 class="text-base font-semibold text-center">{t("nft.auction.details") || "Auction Details"}</h3>

                  <div class="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 space-y-4">
                    <div class="space-y-2 text-center">
                      <div class="text-sm text-[hsl(var(--muted-foreground))]">{t("nft.auction.startingPrice") || "Starting Price"}</div>
                      <TokenValue amount={nftStatus().auction?.startingPrice ?? 0n} tokenAddress={savvaTokenAddress() || undefined} centered />
                    </div>

                    <Show when={highestBidderUser()}>
                      <div class="space-y-2 pt-2 border-t border-[hsl(var(--border))] text-center">
                        <div class="text-sm text-[hsl(var(--muted-foreground))]">{t("nft.auction.highestBid") || "Highest Bid"}</div>
                        <TokenValue amount={nftStatus().auction?.highestBid ?? 0n} tokenAddress={savvaTokenAddress() || undefined} centered />
                        <div class="text-sm text-[hsl(var(--muted-foreground))] pt-2">{t("nft.auction.highestBidder") || "Highest Bidder"}</div>
                        <div class="flex justify-center">
                          <UserCard author={highestBidderUser()} centered />
                        </div>
                      </div>
                    </Show>

                    <div class="space-y-2 pt-2 border-t border-[hsl(var(--border))] text-center">
                      <div class="text-sm text-[hsl(var(--muted-foreground))]">{t("nft.auction.endsIn") || "Auction ends in"}</div>
                      <div class="flex justify-center">
                        <Countdown
                          targetTs={Number(nftStatus().auction?.endTime ?? 0)}
                          size="sm"
                          labelPosition="top"
                          labelStyle="short"
                          onDone={() => setAuctionEnded(true)}
                        />
                      </div>
                    </div>

                    <Show when={isAuctionEnded()}>
                      <div class="pt-2 border-t border-[hsl(var(--border))] text-center">
                        <button
                          type="button"
                          onClick={handleFinalizeAuction}
                          disabled={finalizingAuction()}
                          class={`inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium text-[hsl(var(--primary-foreground))] bg-[hsl(var(--primary))] ${finalizingAuction() ? "opacity-70" : "hover:opacity-90"}`}
                        >
                          <Show when={finalizingAuction()} fallback={t("nft.auction.finalize") || "Finalize Auction"}>
                            <Spinner class="w-4 h-4" />
                          </Show>
                        </button>
                      </div>
                    </Show>
                  </div>
                </div>
              </div>
            </Match>

            <Match when={nftStatus().state === 'owned'}>
              <div class="grid grid-cols-1 gap-8 md:grid-cols-[250px_minmax(0,1fr)] items-start p-6">
                <NftInfoPanel
                  loading={nftMetadata.loading}
                  metadata={nftMetadata}
                  image={summaryImage()}
                  owner={ownerUser}
                />
                <div class="space-y-4">
                  <Show when={isActorOwner()} fallback={<p class="text-sm text-[hsl(var(--muted-foreground))]">{t("nft.owner.notOwner") || "You are not the owner of this NFT."}</p>}>
                    <NftOwnerOptions
                      app={app}
                      tokenId={nftStatus().tokenId}
                      metadata={nftMetadata() || null}
                      onActionComplete={handleActionComplete}
                    />
                  </Show>
                </div>
              </div>
            </Match>
          </Switch>
        </Show>
      </div>
    </Modal>
  );
}
