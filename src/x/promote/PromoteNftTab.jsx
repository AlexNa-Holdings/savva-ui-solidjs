// src/x/promote/PromoteNftTab.jsx
import { createMemo, createResource, Show, Switch, Match } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";
import { getSavvaContract } from "../../blockchain/contracts.js";
import Spinner from "../ui/Spinner.jsx";
import UserCard from "../ui/UserCard.jsx";
import { dbg } from "../../utils/debug.js";

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

    const ownerLower = owner.toLowerCase();
    const marketplaceAddr = marketplace.address.toLowerCase();
    const auctionAddr = auction.address.toLowerCase();

    if (ownerLower === marketplaceAddr) {
      const listing = await marketplace.read.nfts([tokenId]);
      return {
        state: "on_sale",
        tokenId,
        seller: listing.owner,
        price: listing.price,
      };
    }

    if (ownerLower === auctionAddr) {
      const auctionData = await auction.read.auctions([tokenId]);
      if (!auctionData.active) {
        // If auction is not active, it might be in a weird state. Treat as user-owned.
        return { state: "owned", tokenId, owner: auctionData.seller };
      }
      return {
        state: "on_auction",
        tokenId,
        seller: auctionData.seller,
        auction: auctionData,
      };
    }

    return { state: "owned", tokenId, owner };
  } catch (e) {
    dbg.error("PromoteNftTab:fetchNftStatus failed", e);
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

  return (
    <div class="bg-[hsl(var(--background))] rounded-b-xl rounded-t-none border border-[hsl(var(--border))] border-t-0 p-4 space-y-4 -mt-px">
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
            <div class="text-center space-y-2">
              <p class="text-sm font-semibold">This NFT is currently on sale.</p>
              <Show when={!isActorOwner()}>
                <div class="text-sm text-[hsl(var(--muted-foreground))]">Owned by:</div>
                <UserCard author={{ address: nftStatus().seller }} />
              </Show>
              {/* Marketplace controls will go here */}
            </div>
          </Match>

          <Match when={nftStatus().state === 'on_auction'}>
            <div class="text-center space-y-2">
              <p class="text-sm font-semibold">This NFT is currently on auction.</p>
              <Show when={!isActorOwner()}>
                <div class="text-sm text-[hsl(var(--muted-foreground))]">Auction created by:</div>
                <UserCard author={{ address: nftStatus().seller }} />
              </Show>
              {/* Auction controls will go here */}
            </div>
          </Match>

          <Match when={nftStatus().state === 'owned'}>
            <div class="text-center space-y-2">
              <p class="text-sm text-[hsl(var(--muted-foreground))]">NFT owned by:</p>
              <UserCard author={{ address: nftStatus().owner }} />
              {/* Controls for owner to list/auction will go here */}
            </div>
          </Match>
        </Switch>
      </Show>
    </div>
  );
}
