// src/components/profile/WalletTab.jsx
import { useApp } from "../../context/AppContext.jsx";
import TokenValue from "../ui/TokenValue.jsx";
import { createMemo, createResource, Show, createSignal } from "solid-js";
import { getSavvaContract } from "../../blockchain/contracts.js";
import { createPublicClient, http } from "viem";
import Spinner from "../ui/Spinner.jsx";
import RefreshIcon from "../ui/icons/RefreshIcon.jsx";
import ContextMenu from "../ui/ContextMenu.jsx";
import { walletAccount } from "../../blockchain/wallet.js";
import { ChevronDownIcon } from "../ui/icons/ActionIcons.jsx";
import TransferModal from "./TransferModal.jsx";
import IncreaseStakingModal from "./IncreaseStakingModal.jsx";
import UnstakeModal from "./UnstakeModal.jsx";

export default function WalletTab() {
  const app = useApp();
  const { t } = app;

  const user = () => app.authorizedUser();
  const [refreshKey, setRefreshKey] = createSignal(0);
  const RefreshButton = () => (
    <button
      type="button"
      class="inline-flex items-center gap-2 px-2 py-1 rounded-md border border-[hsl(var(--border))] text-sm hover:bg-[hsl(var(--accent))]"
      onClick={() => setRefreshKey((v) => v + 1)}
      title={t("common.refresh")}
    >
      <RefreshIcon class="w-4 h-4" />
      <span>{t("common.refresh")}</span>
    </button>
  );

  async function fetchWalletData({ app, user, refreshKey }) {
    if (!user?.address || !app.desiredChain()) return null;
    try {
      const publicClient = createPublicClient({ chain: app.desiredChain(), transport: http(app.desiredChain().rpcUrls[0]) });
      const savvaTokenContract   = await getSavvaContract(app, "SavvaToken");
      const contentFundContract  = await getSavvaContract(app, "ContentFund");
      const stakingContract      = await getSavvaContract(app, "Staking");
      const [savvaBalance, baseTokenBalance, nftEarnings, stakedBalance, stakingReward] = await Promise.all([
        savvaTokenContract.read.balanceOf([user.address]),
        publicClient.getBalance({ address: user.address }),
        contentFundContract.read.claimableNftGain([user.address]),
        stakingContract.read.balanceOf([user.address]),
        stakingContract.read.claimable([user.address]),
      ]);
      const savvaTokenAddress = savvaTokenContract.address;
      const stakingTokenAddress = stakingContract.address; // ERC20-like share token
      return { savvaBalance, baseTokenBalance, nftEarnings, stakedBalance, stakingReward, savvaTokenAddress, stakingTokenAddress };
    } catch (error) {
      console.error("Failed to fetch wallet data:", error);
      return { error };
    }
  }

  const [walletData, { refetch }] = createResource(() => ({ app, user: user(), refreshKey: refreshKey() }), fetchWalletData);

  const baseTokenSymbol = createMemo(() => app.desiredChain()?.nativeCurrency?.symbol || "PLS");

  function isOwnConnectedWallet() {
    const wa = walletAccount();
    const u = user();
    return !!wa && !!u?.address && String(wa).toLowerCase() === String(u.address).toLowerCase();
  }

  const [showTransfer, setShowTransfer] = createSignal(false);           // SAVVA transfer
  const [showBaseTransfer, setShowBaseTransfer] = createSignal(false);   // base coin transfer
  const [showIncreaseStaking, setShowIncreaseStaking] = createSignal(false);
  const [showStakeTransfer, setShowStakeTransfer] = createSignal(false); // transfer staked-ERC20
  const [showUnstake, setShowUnstake] = createSignal(false);

  async function addSavvaToWallet() {
    try {
      const token = await getSavvaContract(app, "SavvaToken");
      await window.ethereum?.request?.({
        method: "wallet_watchAsset",
        params: { type: "ERC20", options: { address: token.address, symbol: "SAVVA", decimals: 18 } },
      });
    } catch {}
  }

  const savvaMenuItems = createMemo(() =>
    isOwnConnectedWallet()
      ? [
          { label: t("wallet.menu.transfer"), onClick: () => setShowTransfer(true) },
          { label: t("wallet.menu.increaseStaking"), onClick: () => setShowIncreaseStaking(true) },
          { label: t("wallet.menu.addToWallet", { token: "SAVVA" }), onClick: addSavvaToWallet },
        ]
      : []
  );

  const baseMenuItems = createMemo(() =>
    isOwnConnectedWallet()
      ? [{ label: t("wallet.menu.transfer"), onClick: () => setShowBaseTransfer(true) }]
      : []
  );

  // Staked: Increase Staking, Transfer (staking token), Unstake
  const stakedMenuItems = createMemo(() =>
    isOwnConnectedWallet()
      ? [
          { label: t("wallet.menu.increaseStaking"), onClick: () => setShowIncreaseStaking(true) },
          { label: t("wallet.menu.transfer"), onClick: () => setShowStakeTransfer(true) }, // ERC20 transfer of staking share
          { label: t("wallet.menu.unstake"), onClick: () => setShowUnstake(true) },
        ]
      : []
  );

  // NFT Earnings Claim remains from earlier step
  const hasClaimableNft = createMemo(() => {
    const v = walletData()?.nftEarnings;
    return typeof v === "bigint" ? v > 0n : (Number(v || 0) > 0);
  });
  const nftMenuItems = createMemo(() =>
    isOwnConnectedWallet() && hasClaimableNft()
      ? [{ label: t("wallet.menu.claim"), onClick: async () => {
          try {
            const cf = await getSavvaContract(app, "ContentFund", { write: true });
            const hash = await cf.write.claimNFTGain([]);
            const pc = createPublicClient({ chain: app.desiredChain(), transport: http(app.desiredChain().rpcUrls[0]) });
            await pc.waitForTransactionReceipt({ hash });
          } finally { refetch(); app.triggerWalletDataRefresh?.(); }
        }}]
      : []
  );

  const rewardMenuItems = createMemo(() => (isOwnConnectedWallet() ? [] : []));

  const ValueWithMenu = (props) => {
    const items = props.items || [];
    const canMenu = isOwnConnectedWallet() && items.length > 0;
    const triggerContent = (
      <span class="inline-flex items-center gap-1">
        <TokenValue amount={props.amount} tokenAddress={props.tokenAddress} format="vertical" />
        <ChevronDownIcon class="w-4 h-4 opacity-70 self-center" />
      </span>
    );
    return canMenu ? (
      <ContextMenu
        items={items}
        positionClass="relative z-10"
        icon="chevron"
        buttonClass="inline-flex items-center gap-2 px-2 py-1 rounded-md hover:bg-[hsl(var(--accent))] focus:outline-none"
        triggerContent={triggerContent}
      />
    ) : (
      <span class="px-2 py-1">
        <TokenValue amount={props.amount} tokenAddress={props.tokenAddress} format="vertical" />
      </span>
    );
  };

  function handleTransferSubmit() { refetch(); app.triggerWalletDataRefresh?.(); }
  function handleStakeSubmit()    { refetch(); app.triggerWalletDataRefresh?.(); }
  function handleUnstakeSubmit()  { refetch(); app.triggerWalletDataRefresh?.(); }

  const savvaTokenAddress   = () => walletData()?.savvaTokenAddress || "";
  const stakingTokenAddress = () => walletData()?.stakingTokenAddress || ""; // ERC20-like (Staking) — can be transferred by TransferModal :contentReference[oaicite:1]{index=1}

  return (
    <div class="px-2 space-y-6">
      <Show when={!walletData.loading} fallback={<div class="flex justify-center p-8"><Spinner /></div>}>
        <Show when={!walletData.error} fallback={<p class="text-sm text-center text-[hsl(var(--destructive))]">{t("common.error")}: {walletData.error?.message}</p>}>
          <section class="bg-[hsl(var(--card))] text-[hsl(var(--card-foreground))] rounded-lg shadow p-4 space-y-3">
            <div class="flex justify-between items-center">
              <h3 class="text-lg font-medium">{t("profile.wallet.balances.title")}</h3>
              <RefreshButton />
            </div>

            <div class="py-2 border-t border-[hsl(var(--border))] first:border-t-0 first:pt-0 last:pb-0">
              <div class="flex justify-between items-start">
                <div class="pr-4">
                  <h4 class="font-semibold">{t("profile.wallet.savva.title")}</h4>
                  <p class="text-xs text-[hsl(var(--muted-foreground))] mt-1">{t("profile.wallet.savva.description")}</p>
                </div>
                <div class="flex-shrink-0 relative inline-flex items-center">
                  <ValueWithMenu amount={walletData()?.savvaBalance} tokenAddress={savvaTokenAddress()} items={savvaMenuItems()} />
                </div>
              </div>
            </div>

            <div class="py-2 border-t border-[hsl(var(--border))]">
              <div class="flex justify-between items-start">
                <div class="pr-4">
                  <h4 class="font-semibold">{baseTokenSymbol()}</h4>
                  <p class="text-xs text-[hsl(var(--muted-foreground))] mt-1">{t("profile.wallet.pls.description")}</p>
                </div>
                <div class="flex-shrink-0 relative inline-flex items-center">
                  <ValueWithMenu amount={walletData()?.baseTokenBalance} tokenAddress="0" items={baseMenuItems()} />
                </div>
              </div>
            </div>
          </section>

          <section class="bg-[hsl(var(--card))] text-[hsl(var(--card-foreground))] rounded-lg shadow p-4 space-y-3">
            <div class="flex justify-between items-center">
              <h3 class="text-lg font-medium">{t("profile.wallet.nft.title")}</h3>
            </div>

            <div class="py-2">
              <div class="flex justify-between items-start">
                <div class="pr-4">
                  <h4 class="font-semibold">{t("profile.wallet.nftEarnings.title")}</h4>
                  <p class="text-xs text-[hsl(var(--muted-foreground))] mt-1">{t("profile.wallet.nftEarnings.description")}</p>
                </div>
                <div class="flex-shrink-0 relative inline-flex items-center">
                  <ValueWithMenu amount={walletData()?.nftEarnings} items={nftMenuItems()} />
                </div>
              </div>
            </div>
          </section>

          <section class="bg-[hsl(var(--card))] text-[hsl(var(--card-foreground))] rounded-lg shadow p-4 space-y-3">
            <div class="flex justify-between items-center">
              <h3 class="text-lg font-medium">{t("profile.wallet.staking.title")}</h3>
            </div>

            <div class="py-2">
              <div class="flex justify-between items-start">
                <div class="pr-4">
                  <h4 class="font-semibold">{t("profile.wallet.staked.title")}</h4>
                  <p class="text-xs text-[hsl(var(--muted-foreground))] mt-1">{t("profile.wallet.staked.description")}</p>
                </div>
                <div class="flex-shrink-0 relative inline-flex items-center">
                  <ValueWithMenu amount={walletData()?.stakedBalance} tokenAddress={stakingTokenAddress()} items={stakedMenuItems()} />
                </div>
              </div>
            </div>

            <div class="py-2">
              <div class="flex justify-between items-start">
                <div class="pr-4">
                  <h4 class="font-semibold">{t("profile.wallet.reward.title")}</h4>
                  <p class="text-xs text-[hsl(var(--muted-foreground))] mt-1">{t("profile.wallet.reward.description")}</p>
                </div>
                <div class="flex-shrink-0 relative inline-flex items-center">
                  <ValueWithMenu amount={walletData()?.stakingReward} items={[]} />
                </div>
              </div>
            </div>
          </section>
        </Show>
      </Show>

      {/* SAVVA transfer */}
      <Show when={showTransfer()}>
        <TransferModal
          tokenAddress={savvaTokenAddress()}
          onClose={() => setShowTransfer(false)}
          onSubmit={handleTransferSubmit}
          maxAmount={walletData()?.savvaBalance}
        />
      </Show>

      {/* Base-token transfer */}
      <Show when={showBaseTransfer()}>
        <TransferModal
          tokenAddress=""
          onClose={() => setShowBaseTransfer(false)}
          onSubmit={handleTransferSubmit}
          maxAmount={walletData()?.baseTokenBalance}
        />
      </Show>

      {/* Staked token transfer (staking is ERC20-like, so TransferModal works) */}
      <Show when={showStakeTransfer()}>
        <TransferModal
          tokenAddress={stakingTokenAddress()}
          onClose={() => setShowStakeTransfer(false)}
          onSubmit={handleTransferSubmit}
          maxAmount={walletData()?.stakedBalance}
        />
      </Show>

      {/* Increase staking */}
      <Show when={showIncreaseStaking()}>
        <IncreaseStakingModal
          savvaBalance={walletData()?.savvaBalance}
          savvaTokenAddress={savvaTokenAddress()}
          onClose={() => setShowIncreaseStaking(false)}
          onSubmit={handleStakeSubmit}
        />
      </Show>

      {/* Unstake */}
      <Show when={showUnstake()}>
        <UnstakeModal
          onClose={() => setShowUnstake(false)}
          onSubmit={handleUnstakeSubmit}
        />
      </Show>
    </div>
  );
}
