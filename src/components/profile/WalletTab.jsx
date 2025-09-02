// src/components/profile/WalletTab.jsx
import { useApp } from "../../context/AppContext.jsx";
import TokenValue from "../ui/TokenValue.jsx";
import { createMemo, createResource, Show, createSignal, For } from "solid-js";
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
import Countdown from "../ui/Countdown.jsx";

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

  // ── data ─────────────────────────────────────────────────────────────────────
  async function fetchWalletData({ app, user, refreshKey }) {
    if (!user?.address || !app.desiredChain()) return null;
    try {
      const publicClient = createPublicClient({
        chain: app.desiredChain(),
        transport: http(app.desiredChain().rpcUrls[0]),
      });
      const savvaTokenContract = await getSavvaContract(app, "SavvaToken");
      const contentFundContract = await getSavvaContract(app, "ContentFund");
      const stakingContract = await getSavvaContract(app, "Staking");

      const [
        savvaBalance,
        baseTokenBalance,
        nftEarnings,
        stakedBalance,
        stakingReward,
        availableUnstaked,
        unstakeRequests,
      ] = await Promise.all([
        savvaTokenContract.read.balanceOf([user.address]),
        publicClient.getBalance({ address: user.address }),
        contentFundContract.read.claimableNftGain([user.address]),
        stakingContract.read.balanceOf([user.address]),
        stakingContract.read.claimable([user.address]),
        stakingContract.read.getAvailableUnstaked([user.address]),
        stakingContract.read.getUnstakeRequests([user.address]),
      ]);

      return {
        savvaBalance,
        baseTokenBalance,
        nftEarnings,
        stakedBalance,
        stakingReward,
        availableUnstaked,
        unstakeRequests,
        savvaTokenAddress: savvaTokenContract.address,
        stakingTokenAddress: stakingContract.address,
      };
    } catch (error) {
      console.error("Failed to fetch wallet data:", error);
      return { error };
    }
  }

  const [walletData, { refetch }] = createResource(
    () => ({ app, user: user(), refreshKey: refreshKey() }),
    fetchWalletData
  );

  const baseTokenSymbol = createMemo(() => app.desiredChain()?.nativeCurrency?.symbol || "PLS");
  const savvaTokenAddress = () => walletData()?.savvaTokenAddress || "";
  const stakingTokenAddress = () => walletData()?.stakingTokenAddress || "";

  function isOwnConnectedWallet() {
    const wa = walletAccount();
    const u = user();
    return !!wa && !!u?.address && String(wa).toLowerCase() === String(u.address).toLowerCase();
  }

  // ── modals ───────────────────────────────────────────────────────────────────
  const [showTransfer, setShowTransfer] = createSignal(false);
  const [showBaseTransfer, setShowBaseTransfer] = createSignal(false);
  const [showStakeTransfer, setShowStakeTransfer] = createSignal(false);
  const [showIncreaseStaking, setShowIncreaseStaking] = createSignal(false);
  const [showUnstake, setShowUnstake] = createSignal(false);

  async function addSavvaToWallet() {
    try {
      const token = await getSavvaContract(app, "SavvaToken");
      await window.ethereum?.request?.({
        method: "wallet_watchAsset",
        params: { type: "ERC20", options: { address: token.address, symbol: "SAVVA", decimals: 18 } },
      });
    } catch { }
  }

  // ── actions ──────────────────────────────────────────────────────────────────
  async function handleClaimNftEarnings() {
    try {
      const contentFund = await getSavvaContract(app, "ContentFund", { write: true });
      const hash = await contentFund.write.claimNFTGain([]);
      const pc = createPublicClient({ chain: app.desiredChain(), transport: http(app.desiredChain().rpcUrls[0]) });
      await pc.waitForTransactionReceipt({ hash });
    } catch (e) {
      console.error("claimNFTGain failed:", e);
    } finally {
      refetch();
      app.triggerWalletDataRefresh?.();
    }
  }

  async function handleCompoundReward() {
    try {
      const staking = await getSavvaContract(app, "Staking", { write: true });
      const hash = await staking.write.compoundGain([]);
      const pc = createPublicClient({ chain: app.desiredChain(), transport: http(app.desiredChain().rpcUrls[0]) });
      await pc.waitForTransactionReceipt({ hash });
    } catch (e) {
      console.error("compoundGain failed:", e);
    } finally {
      refetch(); app.triggerWalletDataRefresh?.();
    }
  }

  async function handleWithdrawReward() {
    try {
      const staking = await getSavvaContract(app, "Staking", { write: true });
      const hash = await staking.write.claimGain([]);
      const pc = createPublicClient({ chain: app.desiredChain(), transport: http(app.desiredChain().rpcUrls[0]) });
      await pc.waitForTransactionReceipt({ hash });
    } catch (e) {
      console.error("claimGain failed:", e);
    } finally {
      refetch(); app.triggerWalletDataRefresh?.();
    }
  }

  async function handleClaimUnstaked() {
    try {
      const staking = await getSavvaContract(app, "Staking", { write: true });
      const hash = await staking.write.claimUnstaked([]);
      const pc = createPublicClient({ chain: app.desiredChain(), transport: http(app.desiredChain().rpcUrls[0]) });
      await pc.waitForTransactionReceipt({ hash });
    } catch (e) {
      console.error("claimUnstaked failed:", e);
    } finally {
      refetch(); app.triggerWalletDataRefresh?.();
    }
  }

  // ── menus ────────────────────────────────────────────────────────────────────
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
    isOwnConnectedWallet() ? [{ label: t("wallet.menu.transfer"), onClick: () => setShowBaseTransfer(true) }] : []
  );

  const stakedMenuItems = createMemo(() =>
    isOwnConnectedWallet()
      ? [
        { label: t("wallet.menu.increaseStaking"), onClick: () => setShowIncreaseStaking(true) },
        { label: t("wallet.menu.transfer"), onClick: () => setShowStakeTransfer(true) },
        { label: t("wallet.menu.unstake"), onClick: () => setShowUnstake(true) },
      ]
      : []
  );

  const hasClaimableNft = createMemo(() => {
    const v = walletData()?.nftEarnings;
    return typeof v === "bigint" ? v > 0n : Number(v || 0) > 0;
  });

  const nftMenuItems = createMemo(() =>
    isOwnConnectedWallet() && hasClaimableNft()
      ? [{ label: t("wallet.menu.claim"), onClick: handleClaimNftEarnings }]
      : []
  );

  const hasStakingReward = createMemo(() => {
    const v = walletData()?.stakingReward;
    return typeof v === "bigint" ? v > 0n : Number(v || 0) > 0;
  });

  const rewardMenuItems = createMemo(() =>
    isOwnConnectedWallet() && hasStakingReward()
      ? [
        { label: t("wallet.menu.addToStaked"), onClick: handleCompoundReward },
        { label: t("wallet.menu.withdraw"), onClick: handleWithdrawReward },
      ]
      : []
  );

  // NEW: available-unstaked menu (single item: Withdraw)
  const hasAvailableUnstaked = createMemo(() => {
    const v = walletData()?.availableUnstaked;
    return typeof v === "bigint" ? v > 0n : Number(v || 0) > 0;
  });

  const availableMenuItems = createMemo(() =>
    isOwnConnectedWallet() && hasAvailableUnstaked()
      ? [{ label: t("wallet.menu.withdraw"), onClick: handleClaimUnstaked }]
      : []
  );

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
  function handleStakeSubmit() { refetch(); app.triggerWalletDataRefresh?.(); }
  function handleUnstakeSubmit() { refetch(); app.triggerWalletDataRefresh?.(); }

  // ── layout helpers ───────────────────────────────────────────────────────────
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

  // helpers
  function isReqAvailable(ts) {
    const now = Math.floor(Date.now() / 1000);
    return Number(ts) <= now;
  }

  const availableUnstaked = () => walletData()?.availableUnstaked || 0n;
  const unstakeRequests = () => walletData()?.unstakeRequests || [];

  // ── render ───────────────────────────────────────────────────────────────────
  return (
    <div class="px-2 space-y-6 mx-auto max-w-3xl">
      <Show when={!walletData.loading} fallback={<div class="flex justify-center p-8"><Spinner /></div>}>
        <Show when={!walletData.error} fallback={<p class="text-sm text-center text-[hsl(var(--destructive))]">{t("common.error")}: {walletData.error?.message}</p>}>
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
              <ValueWithMenu amount={walletData()?.nftEarnings} items={nftMenuItems()} />
            </WalletRow>
          </WalletSection>

          <WalletSection title={t("profile.wallet.staking.title")}>
            {/* Staked and Reward rows */}
            <WalletRow
              title={t("profile.wallet.staked.title")}
              description={t("profile.wallet.staked.description")}
            >
              <ValueWithMenu
                amount={walletData()?.stakedBalance}
                tokenAddress={stakingTokenAddress()}
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

            {/* Available to withdraw — same pattern as other rows, before the table */}
            <WalletRow
              title={t("profile.wallet.unstaked.available.title")}
              description={t("profile.wallet.unstaked.available.desc")}
            >
              <ValueWithMenu
                amount={availableUnstaked()}
                tokenAddress={savvaTokenAddress()}
                items={availableMenuItems()}
              />
            </WalletRow>

            {/* Current withdraw requests table */}
            <Show when={Array.isArray(unstakeRequests()) && unstakeRequests().length > 0}>
              <div class="pt-3">
                <div class="font-semibold mb-2">{t("profile.wallet.unstaked.requests.title")}</div>
                <div class="overflow-x-auto rounded-md border border-[hsl(var(--border))]">
                  <table class="w-full text-sm">
                    <thead class="bg-[hsl(var(--secondary))] text-[hsl(var(--secondary-foreground))]">
                      <tr>
                        <th class="text-left px-3 py-2">{t("profile.wallet.unstaked.table.status")}</th>
                        <th class="text-right px-3 py-2">{t("profile.wallet.unstaked.table.amount")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      <For each={unstakeRequests()}>
                        {(r) => (
                          <tr class="border-t border-[hsl(var(--border))]">
                            <td class="px-3 py-2">
                              <Show when={isReqAvailable(r.timestamp)} fallback={
                                <span class="opacity-80" data-countdown-ts={Number(r.timestamp)}>
                                  <Countdown targetTs={Number(r.timestamp)} size="sm" anim="reverse" />

                                </span>
                              }>
                                <span class="text-emerald-600">{t("wallet.unstaked.availableNow")}</span>
                              </Show>
                            </td>
                            <td class="px-3 py-2 text-right">
                              <TokenValue amount={r.amount} tokenAddress={savvaTokenAddress()} />
                            </td>
                          </tr>
                        )}
                      </For>
                    </tbody>
                  </table>
                </div>
              </div>
            </Show>
          </WalletSection>
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

      {/* Staked token transfer */}
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
