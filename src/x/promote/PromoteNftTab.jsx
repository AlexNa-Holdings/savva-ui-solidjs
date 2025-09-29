// src/x/promote/PromoteNftTab.jsx
import { createMemo, createResource, Show, Switch, Match } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";
import { getSavvaContract } from "../../blockchain/contracts.js";
import Spinner from "../ui/Spinner.jsx";
import UserCard from "../ui/UserCard.jsx";
import { dbg } from "../../utils/debug.js";
import { ipfs } from "../../ipfs/index.js";
import IpfsImage from "../ui/IpfsImage.jsx";

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
    } catch (e) {
      if (e?.message?.includes("nonexistent token")) {
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
      return {
        state: "on_sale",
        tokenId,
        tokenURI,
        seller: listing.owner,
        price: listing.price,
      };
    }

    if (ownerLower === auctionAddr) {
      const auctionData = await auction.read.auctions([tokenId]);
      if (!auctionData.active) {
        // If auction is not active, it might be in a weird state. Treat as user-owned.
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

  const [nftStatus] = createResource(
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

  const summaryImage = createMemo(() => nftMetadata()?.image || "");

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
              <h4 class="text-lg font-bold">{title()}</h4>
            </Show>

            <div class="mx-auto flex h-[150px] w-[200px] items-center justify-center rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted))]">
              <Show when={imageSrc()} fallback={<span class="text-xs text-[hsl(var(--muted-foreground))]">No preview</span>}>
                <IpfsImage src={imageSrc()} class="w-full h-full" />
              </Show>
            </div>

            <Show when={subtitle()}>
              <p class={`text-sm ${subtitleClass()}`}>{subtitle()}</p>
            </Show>

            <div class="text-sm text-[hsl(var(--muted-foreground))]">{ownerLabel()}:</div>
            <div class="flex justify-center">
              <UserCard author={owner()} centered />
            </div>
          </>
        }>
          <div class="pt-2"><Spinner /></div>
        </Show>
      </div>
    );
  }

  return (
    <div class="flex h-full min-h-0 flex-col bg-[hsl(var(--background))] rounded-b-xl p-4">
      <Show when={nftStatus.loading}>
        <div class="flex justify-center p-8"><Spinner /></div>
      </Show>

      <Show when={!nftStatus.loading && nftStatus()}>
        <Switch>
          <Match when={nftStatus().state === 'error'}>
            <p class="text-center text-sm text-[hsl(var(--destructive))]">{nftStatus().message}</p>
          </Match>

          <Match when={nftStatus().state === 'not_minted'}>
            <div class="text-center space-y-4">
              <p class="text-sm text-[hsl(var(--muted-foreground))]">You can mint an NFT for this post, then put it on sale or up for auction.</p>
              <button class="px-4 py-2 rounded-lg bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90">
                Mint NFT
              </button>
            </div>
          </Match>

          <Match when={nftStatus().state === 'on_sale'}>
            <div class="grid flex-1 min-h-0 grid-cols-1 gap-8 md:grid-cols-[250px_minmax(0,1fr)] items-start">
              <NftInfoPanel
                loading={nftMetadata.loading}
                metadata={nftMetadata}
                image={summaryImage()}
                subtitle="This NFT is currently on sale."
                subtitleClass="pt-2 font-semibold"
                ownerLabel="Seller"
                owner={ownerUser}
              />
              <div class="space-y-2">{/* Marketplace controls will go here */}</div>
            </div>
          </Match>

          <Match when={nftStatus().state === 'on_auction'}>
            <div class="grid flex-1 min-h-0 grid-cols-1 gap-8 md:grid-cols-[250px_minmax(0,1fr)] items-start">
              <NftInfoPanel
                loading={nftMetadata.loading}
                metadata={nftMetadata}
                image={summaryImage()}
                subtitle="This NFT is currently on auction."
                subtitleClass="pt-2 font-semibold"
                ownerLabel="Auction created by"
                owner={ownerUser}
              />
              <div class="space-y-2">{/* Auction controls will go here */}</div>
            </div>
          </Match>

          <Match when={nftStatus().state === 'owned'}>
            <div class="grid flex-1 min-h-0 grid-cols-1 gap-8 md:grid-cols-[250px_minmax(0,1fr)] items-start">
              <NftInfoPanel
                loading={nftMetadata.loading}
                metadata={nftMetadata}
                image={summaryImage()}
                owner={ownerUser}
              />
              <div class="space-y-2">{/* Controls for owner to list/auction will go here */}</div>
            </div>
          </Match>
        </Switch>
      </Show>
    </div>
  );
}
