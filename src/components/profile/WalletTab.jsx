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

/* UI blocks */
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
      <div class="flex-shrink-0 relative inline-flex items-center">
        {props.children}
      </div>
    </div>
  </div>
);

export default function WalletTab(props) {
  const app = useApp();
  const { t } = app;
  const [walletData, { refetch }] = createResource(() => ({ app, user: props.user, refreshKey: app.walletDataNeedsRefresh() }), fetchWalletData);

  const desiredChain = createMemo(() => app.desiredChain());
  const baseTokenSymbol = createMemo(() => desiredChain()?.nativeCurrency?.symbol || "PLS");

  const [showTransfer, setShowTransfer] = createSignal(false);
  const [showIncreaseStaking, setShowIncreaseStaking] = createSignal(false);

  const RefreshButton = () => (
    <button
      onClick={refetch}
      disabled={walletData.loading}
      class="p-1.5 rounded-full text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))] hover:text-[hsl(var(--foreground))] disabled:opacity-50 disabled:cursor-not-allowed"
      aria-label={t("common.refresh")}
      title={t("common.refresh")}
    >
      <RefreshIcon class="w-5 h-5" />
    </button>
  );

  const isOwnConnectedWallet = createMemo(() => {
    const authed = app.authorizedUser()?.address?.toLowerCase();
    const connected = walletAccount()?.toLowerCase();
    const profile = props.user?.address?.toLowerCase();
    return !!authed && authed === profile && connected === profile;
  });

  async function addSavvaToWallet() {
    try {
      const address = walletData()?.savvaTokenAddress || "";
      if (!address || !window?.ethereum?.request) return;
      await window.ethereum.request({
        method: "wallet_watchAsset",
        params: {
          type: "ERC20",
          options: {
            address,
            symbol: "SAVVA",
            decimals: 18,
          },
        },
      });
    } catch (e) {
      console.error("wallet_watchAsset failed:", e);
    }
  }

  const savvaMenuItems = createMemo(() =>
    isOwnConnectedWallet()
      ? [
          { label: t("wallet.menu.transfer"), onClick: () => setShowTransfer(true) },
          { label: t("wallet.menu.increaseStaking"), onClick: () => setShowIncreaseStaking(true) },
          { label: t("wallet.menu.addToWallet", { token: "SAVVA" }),     onClick: addSavvaToWallet },
        ]
      : []
  );
  const baseMenuItems    = createMemo(() => (isOwnConnectedWallet() ? [] : []));
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

      <Show when={showTransfer()}>
        <TransferModal
          tokenAddress={savvaTokenAddress()}
          onClose={() => setShowTransfer(false)}
          onSubmit={handleTransferSubmit}
          maxAmount={walletData()?.savvaBalance}
        />
      </Show>

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