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

  /* Data */
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
      return { savvaBalance, baseTokenBalance, nftEarnings, stakedBalance, stakingReward, savvaTokenAddress };
    } catch (error) {
      console.error("Failed to fetch wallet data:", error);
      return { error };
    }
  }

  const [walletData, { refetch }] = createResource(
    () => ({ app, user: user(), refreshKey: refreshKey() }),
    fetchWalletData
  );

  /* Helpers */
  const baseTokenSymbol = createMemo(() => app.desiredChain()?.nativeCurrency?.symbol || "PLS");

  function isOwnConnectedWallet() {
    const wa = walletAccount();
    const u = user();
    return !!wa && !!u?.address && String(wa).toLowerCase() === String(u.address).toLowerCase();
  }

  /* Menus & modals */
  const [showTransfer, setShowTransfer] = createSignal(false);           // SAVVA transfer
  const [showBaseTransfer, setShowBaseTransfer] = createSignal(false);   // Base token transfer
  const [showIncreaseStaking, setShowIncreaseStaking] = createSignal(false);

  async function addSavvaToWallet() {
    try {
      const token = await getSavvaContract(app, "SavvaToken");
      await window.ethereum?.request?.({
        method: "wallet_watchAsset",
        params: {
          type: "ERC20",
          options: {
            address: token.address,
            symbol: "SAVVA",
            decimals: 18,
          },
        },
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

  // ✅ Base coin: single “Transfer” menu item that opens TransferModal with empty token address
  const baseMenuItems = createMemo(() =>
    isOwnConnectedWallet()
      ? [{ label: t("wallet.menu.transfer"), onClick: () => setShowBaseTransfer(true) }]
      : []
  );

  const nftMenuItems     = createMemo(() => (isOwnConnectedWallet() ? [] : []));
  const stakedMenuItems  = createMemo(() => (isOwnConnectedWallet() ? [] : []));
  const rewardMenuItems  = createMemo(() => (isOwnConnectedWallet() ? [] : []));

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

  function handleTransferSubmit() {
    refetch();
    app.triggerWalletDataRefresh();
  }
  function handleStakeSubmit() {
    refetch();
    app.triggerWalletDataRefresh();
  }

  const savvaTokenAddress = () => walletData()?.savvaTokenAddress || "";

  /* Layout blocks */
  const WalletSection = (props) => (
    <section class="bg-[hsl(var(--card))] text-[hsl(var(--card-foreground))] rounded-lg shadow p-4 space-y-3">
      <div class="flex justify-between items-center">
        <h3 class="text-lg font-medium">{props.title}</h3>
        <Show when={props.headerAction}><div>{props.headerAction}</div></Show>
      </div>
      {props.children}
    </section>
  );

  const WalletRow = (props) => (
    <div class="py-2 border-t border-[hsl(var(--border))] first:border-t-0 first:pt-0 last:pb-0">
      <div class="flex justify-between items-start">
        <div class="pr-4">
          <h4 class="font-semibold">{props.title}</h4>
          <p class="text-xs text-[hsl(var(--muted-foreground))] mt-1">{props.description}</p>
        </div>
        <div class="flex-shrink-0 relative inline-flex items-center">{props.children}</div>
      </div>
    </div>
  );

  return (
    <div class="px-2 space-y-6">
      <Show when={!walletData.loading} fallback={<div class="flex justify-center p-8"><Spinner /></div>}>
        <Show when={!walletData.error} fallback={<p class="text-sm text-center text-[hsl(var(--destructive))]">{t("common.error")}: {walletData.error.message}</p>}>
          <WalletSection title={t("profile.wallet.balances.title")} headerAction={<RefreshButton />}>
            <WalletRow
              title={t("profile.wallet.savva.title")}
              description={t("profile.wallet.savva.description")}
            >
              <ValueWithMenu
                amount={walletData()?.savvaBalance}
                tokenAddress={savvaTokenAddress()}
                items={savvaMenuItems()}
              />
            </WalletRow>

            <WalletRow
              title={baseTokenSymbol()}
              description={t("profile.wallet.pls.description")}
            >
              <ValueWithMenu
                amount={walletData()?.baseTokenBalance}
                tokenAddress="0"
                items={baseMenuItems()}
              />
            </WalletRow>
          </WalletSection>

          <WalletSection title={t("profile.wallet.nft.title")}>
            <WalletRow
              title={t("profile.wallet.nftEarnings.title")}
              description={t("profile.wallet.nftEarnings.description")}
            >
              <ValueWithMenu
                amount={walletData()?.nftEarnings}
                items={nftMenuItems()}
              />
            </WalletRow>
          </WalletSection>

          <WalletSection title={t("profile.wallet.staking.title")}>
            <WalletRow
              title={t("profile.wallet.staked.title")}
              description={t("profile.wallet.staked.description")}
            >
              <ValueWithMenu
                amount={walletData()?.stakedBalance}
                items={stakedMenuItems()}
              />
            </WalletRow>
            <WalletRow
              title={t("profile.wallet.reward.title")}
              description={t("profile.wallet.reward.description")}
            >
              <ValueWithMenu
                amount={walletData()?.stakingReward}
                items={rewardMenuItems()}
              />
            </WalletRow>
          </WalletSection>
        </Show>
      </Show>

      {/* SAVVA transfer modal */}
      <Show when={showTransfer()}>
        <TransferModal
          tokenAddress={savvaTokenAddress()}
          onClose={() => setShowTransfer(false)}
          onSubmit={handleTransferSubmit}
          maxAmount={walletData()?.savvaBalance}
        />
      </Show>

      {/* ✅ Base-token transfer modal (empty / native) */}
      <Show when={showBaseTransfer()}>
        <TransferModal
          tokenAddress=""                 // empty = native coin
          onClose={() => setShowBaseTransfer(false)}
          onSubmit={handleTransferSubmit}
          maxAmount={walletData()?.baseTokenBalance}
        />
      </Show>

      {/* Increase staking (SAVVA) */}
      <Show when={showIncreaseStaking()}>
        <IncreaseStakingModal
          savvaBalance={walletData()?.savvaBalance}
          savvaTokenAddress={savvaTokenAddress()}
          onClose={() => setShowIncreaseStaking(false)}
          onSubmit={handleStakeSubmit}
        />
      </Show>
    </div>
  );
}
