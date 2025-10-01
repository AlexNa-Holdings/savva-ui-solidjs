// src/x/promote/PromoteNftTab.jsx
import { createMemo, createResource, createSignal, Show, Switch, Match } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";
import { getSavvaContract } from "../../blockchain/contracts.js";
import { getConfigParam } from "../../blockchain/config.js";
import Spinner from "../ui/Spinner.jsx";
import UserCard from "../ui/UserCard.jsx";
import TokenValue from "../ui/TokenValue.jsx";
import Countdown from "../ui/Countdown.jsx";
import { dbg } from "../../utils/debug.js";
import { ipfs } from "../../ipfs/index.js";
import IpfsImage from "../ui/IpfsImage.jsx";
import { pushToast, pushErrorToast } from "../../ui/toast.js";
import { httpBase } from "../../net/endpoints.js";
import { sendAsActor } from "../../blockchain/npoMulticall.js";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

function resolveTokenId(post) {
  const cid =
    post?.savva_cid ??
    post?.savvaCid ??
    post?.id ??
    post?.cid ??
    post?.content_cid ??
    post?.ipfs_cid ??
    post?.params?.cid ??
    post?.publishedData?.rootCid ??
    post?.publishedData?.cid ??
    "";
  try {
    return BigInt(cid);
  } catch {
    return 0n;
  }
}

async function fetchNftStatus(app, post) {
  const tokenId = resolveTokenId(post);
  if (!tokenId) return { state: "error", message: "Invalid Post ID for NFT." };

  try {
    const contentNft = await getSavvaContract(app, "ContentNFT");
    const marketplace = await getSavvaContract(app, "NFTMarketplace");
    const auction = await getSavvaContract(app, "NFTAuction");

    let owner;
    try {
      owner = await contentNft.read.ownerOf([tokenId]);
      if (!owner || owner.toLowerCase() === ZERO_ADDRESS) {
        return { state: "not_minted", tokenId };
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
        return { state: "not_minted", tokenId };
      }
      throw e; // Re-throw other errors
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
        dbg.warn?.("PromoteNftTab:getNFTOwner", e?.message || e);
      }

      let price = listing.price;
      try {
        const freshPrice = await marketplace.read.getPrice([tokenId]);
        if (typeof freshPrice === "bigint") price = freshPrice;
      } catch (e) {
        dbg.warn?.("PromoteNftTab:getPrice", e?.message || e);
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
      dbg.log("PromoteNftTab:fetchNftStatus", "Raw auction data", { tokenId: tokenId.toString(), auctionRaw });

      // Viem returns struct as array: [seller, startingPrice, highestBid, highestBidder, endTime, active, bidToken]
      const auctionData = {
        seller: auctionRaw[0],
        startingPrice: auctionRaw[1],
        highestBid: auctionRaw[2],
        highestBidder: auctionRaw[3],
        endTime: auctionRaw[4],
        active: auctionRaw[5],
        bidToken: auctionRaw[6],
      };

      dbg.log("PromoteNftTab:fetchNftStatus", "NFT owned by auction contract", {
        tokenId: tokenId.toString(),
        active: auctionData.active,
        seller: auctionData.seller,
        endTime: auctionData.endTime?.toString()
      });

      if (!auctionData.active) {
        // If auction is not active, it might be in a weird state. Treat as user-owned.
        dbg.warn?.("PromoteNftTab:fetchNftStatus", "Auction not active, treating as owned");
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
    dbg.error("PromoteNftTab:fetchNftStatus failed", e.shortMessage || e.message);
    return { state: "error", message: e.shortMessage || e.message };
  }
}

export default function PromoteNftTab(props) {
  const app = useApp();
  const { t } = app;
  const post = () => props.post || null;
  const actorAddress = () => app.actorAddress?.() || "";
  const savvaTokenAddress = createMemo(() => app.info?.()?.savva_contracts?.SavvaToken?.address || "");
  const desiredChain = createMemo(() => app.desiredChain?.());

  const [nftStatus, { refetch: refetchNftStatus }] = createResource(
    () => ({ app, post: post() }),
    ({ app, post }) => fetchNftStatus(app, post)
  );

  const [nftMetadata] = createResource(
    () => nftStatus()?.tokenURI,
    async (uri) => {
      if (!uri) return null;
      dbg.log("PromoteNftTab:metadata", `Fetching from URI: ${uri}`);
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
        dbg.error("PromoteNftTab:fetchMetadata failed", e);
        return { error: e.message };
      }
    }
  );

  const isActorOwner = createMemo(() => {
    const status = nftStatus();
    const actor = actorAddress().toLowerCase();
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
        dbg.warn?.("PromoteNftTab:ownerProfile", e?.message || e);
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
        dbg.warn?.("PromoteNftTab:highestBidderProfile", e?.message || e);
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

  const [auctionEnded, setAuctionEnded] = createSignal(false);
  const isAuctionEnded = createMemo(() => {
    const status = nftStatus();
    if (status?.state !== "on_auction" || !status.auction?.endTime) return false;
    const now = Math.floor(Date.now() / 1000);
    return Number(status.auction.endTime) <= now || auctionEnded();
  });

  const summaryImage = createMemo(() => nftMetadata()?.image || "");
  const [isRemoving, setIsRemoving] = createSignal(false);
  const [mintBusy, setMintBusy] = createSignal(false);
  const [finalizingAuction, setFinalizingAuction] = createSignal(false);

  const [mintPriceRes] = createResource(
    () => app.selectedDomainName?.() || "",
    async () => await getConfigParam(app, "contentNFT_mintPrice")
  );
  const mintPriceWei = createMemo(() => toBigIntSafe(mintPriceRes()));
  const mintPriceLoading = () => mintPriceRes.loading;
  const mintPriceUnavailable = createMemo(() => !mintPriceLoading() && mintPriceWei() <= 0n);
  const mintPriceError = () => mintPriceRes.error;
  const mintDisabled = createMemo(() => mintBusy() || mintPriceUnavailable() || !!mintPriceError() || !actorAddress());

  const handleOwnerActionComplete = async () => {
    try {
      await refetchNftStatus();
    } catch (err) {
      dbg.warn?.("PromoteNftTab:refetch", err?.message || err);
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
      dbg.error?.("PromoteNftTab:removeFromMarket", err);
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
      dbg.error?.("PromoteNftTab:finalizeAuction", err);
    } finally {
      setFinalizingAuction(false);
    }
  }

  async function uploadMetadataJson(metadata, tokenId) {
    const form = new FormData();
    const jsonString = JSON.stringify(metadata, null, 2);
    const fileName = `nft-${tokenId ?? "metadata"}.json`;
    const blob = new Blob([jsonString], { type: "application/json" });
    form.append("file", blob, fileName);

    const url = `${httpBase()}store`;
    const response = await fetch(url, {
      method: "POST",
      credentials: "include",
      body: form,
    });

    if (!response.ok) {
      throw new Error(`Store upload failed (${response.status})`);
    }

    const data = await response.json();
    const cid = extractCid(data);
    if (!cid) throw new Error("API did not return CID for uploaded metadata");
    return cid;
  }

  async function handleMint() {
    if (mintDisabled()) return;

    const status = nftStatus();
    const currentPost = post();
    const priceWei = mintPriceWei();

    if (!status?.tokenId || !currentPost) {
      pushErrorToast(new Error("NFT data is not ready"));
      return;
    }

    if (priceWei <= 0n) {
      pushErrorToast(new Error(t("nft.owner.mint.priceUnavailable") || "Mint price is not configured."));
      return;
    }

    const authorAddr = currentPost.author?.address || currentPost.author_address;
    if (!authorAddr) {
      pushErrorToast(new Error("Author address is missing"));
      return;
    }

    const domainName = app.selectedDomainName?.() || currentPost.domain || "";
    if (!domainName) {
      pushErrorToast(new Error("Domain is not available"));
      return;
    }

    const guid = currentPost.guid || currentPost.post_guid || currentPost.id || currentPost.savva_cid || status.tokenId.toString();
    if (!guid) {
      pushErrorToast(new Error("Content GUID is not available"));
      return;
    }

    const origin = globalThis?.location?.origin || `https://${domainName}`;
    const imageUri = resolveMetadataImage(currentPost, summaryImage());
    const slug = currentPost.slug || currentPost.permalink || currentPost.savva_cid || currentPost.guid || status.tokenId.toString();
    const metadata = buildMetadataForPost(currentPost, {
      imageUri,
      origin,
      slug,
    });

    setMintBusy(true);
    let mintToastId;

    try {
      mintToastId = pushToast({
        type: "info",
        message: t("nft.owner.mint.toast.pending") || "Minting NFT…",
        autohideMs: 0,
      });

      const metadataCid = await uploadMetadataJson(metadata, status.tokenId);

      await sendAsActor(app, {
        contractName: "ContentNFT",
        functionName: "mint",
        args: [authorAddr, status.tokenId, domainName, guid, `ipfs://${metadataCid}`],
        valueWei: priceWei,
      });

      app.dismissToast?.(mintToastId);
      pushToast({ type: "success", message: t("nft.owner.mint.toast.success") || "NFT minted." });
      await handleOwnerActionComplete();
    } catch (err) {
      pushErrorToast(err, { context: t("nft.owner.mint.toast.error") || "Failed to mint NFT." });
      dbg.error?.("PromoteNftTab:mint", err);
    } finally {
      if (mintToastId) app.dismissToast?.(mintToastId);
      setMintBusy(false);
    }
  }

  function NftInfoPanel(props) {
    const loading = createMemo(() => (typeof props.loading === "function" ? props.loading() : !!props.loading));
    const metadata = createMemo(() => (typeof props.metadata === "function" ? props.metadata() : props.metadata));
    const owner = createMemo(() => (typeof props.owner === "function" ? props.owner() : props.owner));
    const imageSrc = createMemo(() => props.image ?? metadata()?.image ?? "");
    const title = createMemo(() => props.title ?? metadata()?.name ?? "");
    const subtitle = createMemo(() => props.subtitle ?? "");
    const ownerLabel = createMemo(() => props.ownerLabel || "Owner");
    const subtitleClass = () => props.subtitleClass || "pt-2";

    return (
      <div class="space-y-3 w-[250px] mx-auto text-center">
        <Show when={loading()} fallback={
          <>
            <Show when={title()}>
              <h4 class="text-lg font-bold leading-tight line-clamp-3 break-words">
                {title()}
              </h4>
            </Show>

            <div class="mx-auto flex h-[150px] w-[200px] items-center justify-center rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted))]">
              <Show when={imageSrc()} fallback={<span class="text-xs text-[hsl(var(--muted-foreground))]">No preview</span>}>
                <IpfsImage src={imageSrc()} class="w-full h-full" />
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

  return (
    <div class="flex h-full min-h-0 flex-col bg-[hsl(var(--background))] rounded-b-xl rounded-t-none border border-[hsl(var(--border))] border-t-0 p-4 space-y-4 -mt-px">
      <Show when={nftStatus.loading}>
        <div class="flex justify-center p-8"><Spinner /></div>
      </Show>

      <Show when={!nftStatus.loading && nftStatus()}>
        <Switch>
          <Match when={nftStatus().state === 'error'}>
            <p class="text-center text-sm text-[hsl(var(--destructive))]">{nftStatus().message}</p>
          </Match>

          <Match when={nftStatus().state === 'not_minted'}>
            <div class="text-center space-y-4 max-w-xl mx-auto">
              <p class="text-sm text-[hsl(var(--muted-foreground))]">
                {t("nft.owner.mint.intro") || "You can mint an NFT for this post, then put it on sale or up for auction."}
              </p>

              <Show when={!mintPriceLoading()} fallback={<div class="flex justify-center py-4"><Spinner /></div>}>
                <Show when={!mintPriceError()} fallback={<p class="text-sm text-[hsl(var(--destructive))]">{t("nft.owner.mint.priceError") || "Unable to load mint price."}</p>}>
                  <Show when={!mintPriceUnavailable()} fallback={<p class="text-sm text-[hsl(var(--destructive))]">{t("nft.owner.mint.priceUnavailable") || "Mint price is not configured."}</p>}>
                    <div class="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 space-y-2">
                      <div class="text-sm text-[hsl(var(--muted-foreground))]">{t("nft.owner.mint.priceLabel") || "Price for minting NFT"}</div>
                      <TokenValue amount={mintPriceWei()} tokenAddress="0" centered />
                      <p class="text-xs text-[hsl(var(--muted-foreground))]">
                        {t("nft.owner.mint.note") || "All collected funds go to the Buy & Burn contract."}
                      </p>
                    </div>
                  </Show>
                </Show>
              </Show>

              <Show when={actorAddress()} fallback={<p class="text-xs text-[hsl(var(--muted-foreground))]">{t("wallet.connectPrompt")}</p>}>
                <button
                  class="px-4 py-2 rounded-lg bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90 disabled:opacity-60"
                  disabled={mintDisabled()}
                  onClick={handleMint}
                >
                  <Show when={mintBusy()} fallback={t("nft.owner.mint.submit") || "Mint NFT"}>
                    <Spinner class="w-4 h-4" />
                  </Show>
                </button>
              </Show>
            </div>
          </Match>

          <Match when={nftStatus().state === 'on_sale'}>
            <div class="grid flex-1 min-h-0 grid-cols-1 gap-8 md:grid-cols-[250px_minmax(0,1fr)] items-start">
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
            <div class="grid flex-1 min-h-0 grid-cols-1 gap-8 md:grid-cols-[250px_minmax(0,1fr)] items-start">
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
            <div class="flex flex-col items-center justify-center space-y-4 py-6">
              <NftInfoPanel
                loading={nftMetadata.loading}
                metadata={nftMetadata}
                image={summaryImage()}
                owner={ownerUser}
              />
              <p class="text-sm text-[hsl(var(--muted-foreground))] text-center max-w-md">
                {t("nft.minted.info") || "NFT has been minted successfully. Use the 'Manage NFT' button on the post page to control this NFT."}
              </p>
            </div>
          </Match>
        </Switch>
      </Show>
    </div>
  );
}

function toBigIntSafe(value) {
  if (typeof value === "bigint") return value;
  if (typeof value === "number" && Number.isFinite(value)) return BigInt(Math.floor(value));
  if (typeof value === "string" && value) {
    try { return BigInt(value); } catch { return 0n; }
  }
  return 0n;
}

function extractCid(value) {
  if (!value) return undefined;
  if (typeof value === "string") return value.trim() || undefined;
  if (typeof value === "object") {
    const candidates = [
      value.cid,
      value.ipfsCid,
      value.data_cid,
      value.dataCid,
      value.value,
      value.result,
      value.payload,
      value["/"],
    ];
    for (const cand of candidates) {
      const extracted = extractCid(cand);
      if (extracted) return extracted;
    }
  }
  return undefined;
}

function resolveMetadataImage(post, fallback) {
  const origin = globalThis?.location?.origin || "https://savva.app";
  const candidates = [
    post?.thumbnail_url,
    post?.thumbnailUrl,
    post?.thumbnail,
    post?.savva_content?.thumbnail,
    post?.publishedData?.descriptor?.thumbnail,
    fallback,
    post?.author?.avatar,
    defaultAvatarUrl(origin),
  ];
  for (const candidate of candidates) {
    const normalized = normalizeImageUri(candidate, origin, post);
    if (normalized) return normalized;
  }
  return undefined;
}

function normalizeImageUri(value, origin, post) {
  if (!value) return undefined;
  const trimmed = String(value).trim();
  if (!trimmed) return undefined;
  if (trimmed.startsWith("ipfs://") || trimmed.startsWith("https://") || trimmed.startsWith("http://")) return trimmed;
  if (trimmed.startsWith("/")) return `${origin.replace(/\/$/, "")}${trimmed}`;
  if (trimmed.startsWith("uploads/")) {
    const cid = post?.savva_cid || post?.savvaCid || post?.publishedData?.cid;
    if (cid) return `ipfs://${cid}/${trimmed}`;
    return `${origin.replace(/\/$/, "")}/${trimmed}`;
  }
  if (/^[a-z0-9]{46}$/i.test(trimmed) || trimmed.startsWith("Qm") || trimmed.startsWith("bafy")) {
    return `ipfs://${trimmed}`;
  }
  return trimmed;
}

function defaultAvatarUrl(origin) {
  return `${origin.replace(/\/$/, "")}/assets/images/default-avatar.png`;
}

function buildMetadataForPost(post, options = {}) {
  const title = resolveTitle(post);
  const slug = options.slug || post?.slug || post?.permalink || post?.savva_cid || post?.guid || post?.id || "";
  const name = title || (slug ? `Content ${slug}` : "Untitled Content");

  const createdRaw =
    post?.published_at ||
    post?.publishedAt ||
    post?.created_at ||
    post?.createdAt ||
    post?.created_on;
  let formattedDate = "";
  if (createdRaw) {
    const date = new Date(createdRaw);
    if (!Number.isNaN(date.getTime())) {
      formattedDate = date.toLocaleDateString(undefined, {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      });
    }
  }
  const description = formattedDate ? `(${formattedDate}). ${name}` : name;

  const origin = (options.origin || globalThis?.location?.origin || "https://savva.app").replace(/\/$/, "");
  const externalUrl = slug ? `${origin}/#/post/${slug}` : `${origin}/#/post/${post?.savva_cid || ""}`;

  const category = resolveCategory(post);
  const attributes = category
    ? [{ trait_type: "Category", value: category }]
    : undefined;

  const metadata = {
    name,
    description,
    external_url: externalUrl,
  };

  metadata.image = options.imageUri || defaultAvatarUrl(origin);
  if (attributes) metadata.attributes = attributes;

  return metadata;
}

function resolveTitle(post) {
  if (!post) return "";
  const direct = firstNonEmpty([
    post.title,
    post.name,
    post.caption,
    post?.descriptor?.title,
    post?.savva_content?.title,
  ]);
  if (direct) return direct;

  const locales = post?.descriptor?.locales || post?.savva_content?.locales;
  if (locales && typeof locales === "object") {
    const english = firstNonEmpty([locales.en?.title, locales.en?.name]);
    if (english) return english;
    for (const entry of Object.values(locales)) {
      const locTitle = firstNonEmpty([entry?.title, entry?.name]);
      if (locTitle) return locTitle;
    }
  }

  const fallbackArr = Array.isArray(post?.titles) ? post.titles : [];
  const fallback = firstNonEmpty(fallbackArr);
  return fallback || "";
}

function resolveCategory(post) {
  if (!post) return undefined;
  const pick = (v) => (typeof v === "string" ? v : v?.name || v?.label);
  return (
    pick(post.category) ||
    (Array.isArray(post.categories) && pick(post.categories[0])) ||
    (Array.isArray(post.tags) && post.tags[0]) ||
    pickFromLocalesArray(post?.descriptor?.locales, 'categories') ||
    pickFromLocalesArray(post?.savva_content?.locales, 'categories')
  );
}

function firstNonEmpty(values) {
  if (!Array.isArray(values)) values = [values];
  for (const value of values) {
    if (value === null || value === undefined) continue;
    const str = String(value).trim();
    if (str) return str;
  }
  return "";
}

function pickFromLocalesArray(locales, key) {
  if (!locales || typeof locales !== "object") return undefined;
  const english = locales.en;
  if (english && Array.isArray(english[key]) && english[key].length > 0) {
    const value = english[key][0];
    return typeof value === "string" ? value : value?.name || value?.label;
  }
  for (const locale of Object.values(locales)) {
    if (!locale) continue;
    const arr = locale[key];
    if (Array.isArray(arr) && arr.length > 0) {
      const value = arr[0];
      return typeof value === "string" ? value : value?.name || value?.label;
    }
  }
  return undefined;
}
