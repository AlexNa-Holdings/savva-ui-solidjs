// src/x/profile/WalletTab.jsx
import { useApp } from "../../context/AppContext.jsx";
import TokenValue from "../ui/TokenValue.jsx";
import { createMemo, createResource, Show, createSignal, For, createEffect, onCleanup } from "solid-js";
import { getSavvaContract, configuredHttp } from "../../blockchain/contracts.js";
import { createPublicClient } from "viem";
import Spinner from "../ui/Spinner.jsx";
import RefreshIcon from "../ui/icons/RefreshIcon.jsx";
import ContextMenu from "../ui/ContextMenu.jsx";
import { ChevronDownIcon } from "../ui/icons/ActionIcons.jsx";
import TransferModal from "../modals/TransferModal.jsx";
import IncreaseStakingModal from "../modals/IncreaseStakingModal.jsx";
import UnstakeModal from "../modals/UnstakeModal.jsx";
import Countdown from "../ui/Countdown.jsx";
import { sendAsActor } from "../../blockchain/npoMulticall.js";
import SavvaTokenAbi from "../../blockchain/abi/SavvaToken.json";
import StakingAbi from "../../blockchain/abi/Staking.json";
import ContentFundAbi from "../../blockchain/abi/ContentFund.json";

export default function WalletTab(props) {
  const app = useApp();
  const { t } = app;

  const viewedUser = () => props.user || app.authorizedUser();
  const [refreshKey, setRefreshKey] = createSignal(0);
  const [correctedStaked, setCorrectedStaked] = createSignal(null); // Override for staked value if blockchain differs
  const [fixRequestSent, setFixRequestSent] = createSignal(false); // Track if we've already sent a fix request

  // 🔁 Refresh data automatically when ACTOR changes (wallet open)
  createEffect(() => {
    app.actorAddress?.();              // subscribe to actor
    setRefreshKey((v) => v + 1);       // trigger refetch
  });

  const isActorProfile = createMemo(() => {
    const actor = (app.actorAddress?.() || "").toLowerCase();
    const viewed = (viewedUser()?.address || "").toLowerCase();
    return !!actor && !!viewed && actor === viewed;
  });

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

  async function fetchWalletData({ app, user }) {
    if (!user?.address || !app.desiredChain()) return null;
    try {
      const publicClient = createPublicClient({
        chain: app.desiredChain(),
        transport: configuredHttp(app.desiredChain().rpcUrls[0]),
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
        savvaTotalSupply,
        totalStaked,
      ] = await Promise.all([
        savvaTokenContract.read.balanceOf([user.address]),
        publicClient.getBalance({ address: user.address }),
        contentFundContract.read.claimableNftGain([user.address]),
        stakingContract.read.balanceOf([user.address]),
        stakingContract.read.claimable([user.address]),
        stakingContract.read.getAvailableUnstaked([user.address]),
        stakingContract.read.getUnstakeRequests([user.address]),
        savvaTokenContract.read.totalSupply(),
        stakingContract.read.totalSupply(),
      ]);

      return {
        savvaBalance,
        baseTokenBalance,
        nftEarnings,
        stakedBalance,
        stakingReward,
        availableUnstaked,
        unstakeRequests,
        savvaTotalSupply,
        totalStaked,
        savvaTokenAddress: savvaTokenContract.address,
        stakingTokenAddress: stakingContract.address,
      };
    } catch (error) {
      console.error("Failed to fetch wallet data:", error);
      return { error };
    }
  }

  const [walletData, { refetch }] = createResource(
    () => ({ app, user: viewedUser(), refreshKey: refreshKey() }),
    fetchWalletData
  );

  // Compare blockchain staked value with backend value and fix if different
  createEffect(() => {
    const data = walletData();
    const user = viewedUser();

    if (!data || data.error || !user || !user.address) return;

    const blockchainStaked = data.stakedBalance;
    if (typeof blockchainStaked !== 'bigint') return;

    // Convert backend staked to bigint for comparison
    let backendStaked;
    try {
      if (typeof user.staked === 'bigint') {
        backendStaked = user.staked;
      } else if (typeof user.staked === 'number' || typeof user.staked === 'string') {
        backendStaked = BigInt(Math.floor(Number(user.staked)));
      } else {
        return; // Can't convert, skip comparison
      }
    } catch (e) {
      console.warn('[WalletTab] Failed to convert backend staked value:', user.staked);
      return;
    }

    // If values differ, we need to correct the backend
    if (blockchainStaked !== backendStaked) {
      // Only send fix request once per mismatch
      if (fixRequestSent()) {
        console.log('[WalletTab] Fix request already sent, waiting for backend to sync...', {
          blockchain: blockchainStaked.toString(),
          backend: backendStaked.toString(),
          diff: (blockchainStaked - backendStaked).toString(),
        });
        return;
      }

      console.warn('[WalletTab] Staked value mismatch detected:', {
        blockchain: blockchainStaked.toString(),
        backend: backendStaked.toString(),
        userAddress: user.address,
        diff: (blockchainStaked - backendStaked).toString(),
      });

      // Store the corrected value for immediate display update
      setCorrectedStaked(blockchainStaked);

      // Send fix request to backend - this will update the backend's cached value
      const fixStakedValue = async () => {
        try {
          const wsMethod = app.wsMethod?.("fix");
          if (wsMethod) {
            setFixRequestSent(true); // Mark that we've sent the request
            await wsMethod({ user: user.address });
            console.log('[WalletTab] Sent fix request for user:', user.address);
            console.log('[WalletTab] Backend will sync automatically. Values will match on next page load.');
          } else {
            console.warn('[WalletTab] wsMethod("fix") not available');
          }
        } catch (error) {
          console.error('[WalletTab] Failed to send fix request:', error);
          setFixRequestSent(false); // Allow retry on error
        }
      };

      fixStakedValue();
    } else {
      // Values match, clear any correction and reset fix flag
      setCorrectedStaked(null);
      setFixRequestSent(false);
    }
  });

  createEffect(() => {
    if (typeof window === "undefined") return;
    const info = app.info();
    const chain = app.desiredChain?.();
    const user = viewedUser();
    const rpcUrl = chain?.rpcUrls?.[0];
    if (!info || !user?.address || !chain || !rpcUrl) return;

    const savvaTokenAddress = info.savva_contracts?.SavvaToken?.address;
    const stakingAddress = info.savva_contracts?.Staking?.address;
    const contentFundAddress = info.savva_contracts?.ContentFund?.address;
    if (!savvaTokenAddress && !stakingAddress && !contentFundAddress) return;

    const client = createPublicClient({ chain, transport: configuredHttp(rpcUrl) });
    const target = user.address.toLowerCase();

    const bumpRefresh = () => setRefreshKey((v) => v + 1);
    const matchesAny = (log, fields) =>
      fields.some((field) => String(log.args?.[field] || "").toLowerCase() === target);

    const watchers = [];

    if (savvaTokenAddress) {
      watchers.push(
        client.watchContractEvent({
          address: savvaTokenAddress,
          abi: SavvaTokenAbi,
          eventName: "Transfer",
          onLogs: (logs = []) => {
            if (logs.some((log) => matchesAny(log, ["from", "to"]))) bumpRefresh();
          },
        })
      );
    }

    if (stakingAddress) {
      const stakingEvents = [
        { name: "Staked", fields: ["user"] },
        { name: "Unstaked", fields: ["user"] },
        { name: "GainClaimed", fields: ["user"] },
        { name: "ClaimUnstaked", fields: ["user"] },
        { name: "Compounded", fields: ["user"] },
        { name: "Transferred", fields: ["from", "to"] },
      ];

      stakingEvents.forEach(({ name, fields }) => {
        watchers.push(
          client.watchContractEvent({
            address: stakingAddress,
            abi: StakingAbi,
            eventName: name,
            onLogs: (logs = []) => {
              if (logs.some((log) => matchesAny(log, fields))) bumpRefresh();
            },
          })
        );
      });
    }

    if (contentFundAddress) {
      watchers.push(
        client.watchContractEvent({
          address: contentFundAddress,
          abi: ContentFundAbi,
          eventName: "ClaimedNFTGain",
          onLogs: (logs = []) => {
            if (logs.some((log) => matchesAny(log, ["nft_owner"]))) bumpRefresh();
          },
        })
      );
    }

    onCleanup(() => {
      for (const stop of watchers) {
        try {
          stop?.();
        } catch (err) {
          console.error("WalletTab: failed to stop event watcher", err);
        }
      }
    });
  });

  const baseTokenSymbol = createMemo(() => app.desiredChain()?.nativeCurrency?.symbol || "PLS");
  const savvaTokenAddress = () => walletData()?.savvaTokenAddress || "";
  const stakingTokenAddress = () => walletData()?.stakingTokenAddress || "";

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

  async function handleClaimNftEarnings() {
    try {
      await sendAsActor(app, { contractName: "ContentFund", functionName: "claimNFTGain", args: [] });
    } catch (e) { console.error("claimNFTGain failed:", e); }
    finally { refetch(); app.triggerWalletDataRefresh?.(); }
  }
  async function handleCompoundReward() {
    try {
      await sendAsActor(app, { contractName: "Staking", functionName: "compoundGain", args: [] });
    } catch (e) { console.error("compoundGain failed:", e); }
    finally { refetch(); app.triggerWalletDataRefresh?.(); }
  }
  async function handleWithdrawReward() {
    try {
      await sendAsActor(app, { contractName: "Staking", functionName: "claimGain", args: [] });
    } catch (e) { console.error("claimGain failed:", e); }
    finally { refetch(); app.triggerWalletDataRefresh?.(); }
  }
  async function handleClaimUnstaked() {
    try {
      await sendAsActor(app, { contractName: "Staking", functionName: "claimUnstaked", args: [] });
    } catch (e) { console.error("claimUnstaked failed:", e); }
    finally { refetch(); app.triggerWalletDataRefresh?.(); }
  }

  const savvaMenuItems = createMemo(() =>
    isActorProfile()
      ? [
        { label: t("wallet.menu.transfer"), onClick: () => setShowTransfer(true) },
        { label: t("wallet.menu.increaseStaking"), onClick: () => setShowIncreaseStaking(true) },
        { label: t("wallet.menu.addToWallet", { token: "SAVVA" }), onClick: addSavvaToWallet },
      ]
      : []
  );
  const baseMenuItems = createMemo(() => (isActorProfile() ? [{ label: t("wallet.menu.transfer"), onClick: () => setShowBaseTransfer(true) }] : []));
  const stakedMenuItems = createMemo(() =>
    isActorProfile()
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
  const nftMenuItems = createMemo(() => (isActorProfile() && hasClaimableNft() ? [{ label: t("wallet.menu.claim"), onClick: handleClaimNftEarnings }] : []));
  const hasStakingReward = createMemo(() => {
    const v = walletData()?.stakingReward;
    return typeof v === "bigint" ? v > 0n : Number(v || 0) > 0;
  });
  const rewardMenuItems = createMemo(() =>
    isActorProfile() && hasStakingReward()
      ? [
        { label: t("wallet.menu.addToStaked"), onClick: handleCompoundReward },
        { label: t("wallet.menu.withdraw"), onClick: handleWithdrawReward },
      ]
      : []
  );
  const hasAvailableUnstaked = createMemo(() => {
    const v = walletData()?.availableUnstaked;
    return typeof v === "bigint" ? v > 0n : Number(v || 0) > 0;
  });
  const availableMenuItems = createMemo(() => (isActorProfile() && hasAvailableUnstaked() ? [{ label: t("wallet.menu.withdraw"), onClick: handleClaimUnstaked }] : []));

  const ValueWithMenu = (props) => {
    const items = props.items || [];
    const canMenu = isActorProfile() && items.length > 0;
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

  function isReqAvailable(ts) {
    const now = Math.floor(Date.now() / 1000);
    return Number(ts) <= now;
  }

  const stakingApr = createMemo(() => {
    const totalSupply = walletData()?.savvaTotalSupply;
    if (!totalSupply || totalSupply <= 0n) return null;

    // Weekly mint for staking is 120,000 tokens.
    const weeklyMint = 120_000n * (10n ** 18n);
    const yearlyMint = weeklyMint * 52n;

    const apr = (yearlyMint * 10000n) / totalSupply; // Multiply by 10000 for 2 decimal places
    const aprString = (Number(apr) / 100).toFixed(2);

    return `${aprString}%`;
  });

  const userStakePercentage = createMemo(() => {
    const userStaked = walletData()?.stakedBalance;
    const totalStaked = walletData()?.totalStaked;

    if (!userStaked || !totalStaked || totalStaked <= 0n) return null;

    // Calculate percentage with 2 decimal places
    // Multiply by 10000 to get 2 decimal precision
    const percentage = (userStaked * 10000n) / totalStaked;
    const percentageString = (Number(percentage) / 100).toFixed(2);

    return `${percentageString}%`;
  });

  const availableUnstaked = () => walletData()?.availableUnstaked || 0n;
  const unstakeRequests = () => walletData()?.unstakeRequests || [];

  return (
    <div class="px-2 space-y-6 mx-auto max-w-3xl">
      <Show when={!walletData.loading} fallback={<div class="flex justify-center p-8"><Spinner /></div>}>
        <Show when={!walletData.error} fallback={<p class="text-sm text-center text-[hsl(var(--destructive))]">{t("common.error")}: {walletData.error?.message}</p>}>
          <WalletSection title={t("profile.wallet.balances.title")} headerAction={<RefreshButton />}>
            <WalletRow title={t("profile.wallet.savva.title")} description={t("profile.wallet.savva.description")}>
              <ValueWithMenu amount={walletData()?.savvaBalance} tokenAddress={walletData()?.savvaTokenAddress} items={savvaMenuItems()} />
            </WalletRow>
            <WalletRow title={baseTokenSymbol()} description={t("profile.wallet.pls.description")}>
              <ValueWithMenu amount={walletData()?.baseTokenBalance} tokenAddress="0" items={baseMenuItems()} />
            </WalletRow>
          </WalletSection>



          <WalletSection
            title={t("profile.wallet.staking.title")}
            headerAction={
              <div class="flex flex-col items-end gap-1">
                <Show when={stakingApr()}>
                  <div class="text-sm font-semibold text-[hsl(var(--muted-foreground))]">APR: {stakingApr()}</div>
                </Show>
                <Show when={walletData()?.totalStaked}>
                  <div class="text-xs text-[hsl(var(--muted-foreground))] text-right">
                    <div class="opacity-70">{t("profile.wallet.staking.totalStaked") || "Total Staked"}:</div>
                    <TokenValue amount={walletData()?.totalStaked} tokenAddress={walletData()?.stakingTokenAddress} format="vertical" />
                  </div>
                </Show>
              </div>
            }
          >
            <WalletRow title={t("profile.wallet.staked.title")} description={t("profile.wallet.staked.description")}>
              <div class="flex flex-col items-end gap-0.5">
                <ValueWithMenu amount={walletData()?.stakedBalance} tokenAddress={walletData()?.stakingTokenAddress} items={stakedMenuItems()} />
                <Show when={userStakePercentage()}>
                  <div class="text-xs text-[hsl(var(--muted-foreground))] px-2">
                    {userStakePercentage()} {t("profile.wallet.staking.ofTotal") || "of total"}
                  </div>
                </Show>
              </div>
            </WalletRow>

            <WalletRow title={t("profile.wallet.reward.title")} description={t("profile.wallet.reward.description")}>
              <ValueWithMenu amount={walletData()?.stakingReward} items={rewardMenuItems()} />
            </WalletRow>

            <WalletRow title={t("profile.wallet.unstaked.available.title")} description={t("profile.wallet.unstaked.available.desc")}>
              <ValueWithMenu amount={availableUnstaked()} tokenAddress={walletData()?.savvaTokenAddress} items={availableMenuItems()} />
            </WalletRow>

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
                              <Show
                                when={isReqAvailable(r.timestamp)}
                                fallback={
                                  <span class="opacity-80" data-countdown-ts={Number(r.timestamp)}>
                                    <Countdown targetTs={Number(r.timestamp)} size="sm" anim="reverse" labelStyle="short" />
                                  </span>
                                }
                              >
                                <span class="text-emerald-600">{t("wallet.unstaked.availableNow")}</span>
                              </Show>
                            </td>
                            <td class="px-3 py-2 text-right">
                              <TokenValue amount={r.amount} tokenAddress={walletData()?.savvaTokenAddress} />
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

          <WalletSection title={t("profile.wallet.nft.title")}>
            <WalletRow title={t("profile.wallet.nftEarnings.title")} description={t("profile.wallet.nftEarnings.description")}>
              <ValueWithMenu amount={walletData()?.nftEarnings} items={nftMenuItems()} />
            </WalletRow>
          </WalletSection>
        </Show>
      </Show>

      {/* Modals */}
      <Show when={showTransfer()}>
        <TransferModal
          isOpen={showTransfer()}
          tokenAddress={walletData()?.savvaTokenAddress}
          onClose={() => setShowTransfer(false)}
          onSubmit={() => { setShowTransfer(false); refetch(); }}
          maxAmount={walletData()?.savvaBalance}
        />
      </Show>

      <Show when={showBaseTransfer()}>
        <TransferModal
          isOpen={showBaseTransfer()}
          tokenAddress=""
          onClose={() => setShowBaseTransfer(false)}
          onSubmit={() => { setShowBaseTransfer(false); refetch(); }}
          maxAmount={walletData()?.baseTokenBalance}
        />
      </Show>

      <Show when={showStakeTransfer()}>
        <TransferModal
          isOpen={showStakeTransfer()}
          tokenAddress={walletData()?.stakingTokenAddress}
          onClose={() => setShowStakeTransfer(false)}
          onSubmit={() => { setShowStakeTransfer(false); refetch(); }}
          maxAmount={walletData()?.stakedBalance}
        />
      </Show>

      <Show when={showIncreaseStaking()}>
        <IncreaseStakingModal
          isOpen={showIncreaseStaking()}
          savvaBalance={walletData()?.savvaBalance}
          savvaTokenAddress={walletData()?.savvaTokenAddress}
          onClose={() => setShowIncreaseStaking(false)}
          onSubmit={() => { setShowIncreaseStaking(false); refetch(); }}
        />
      </Show>

      <Show when={showUnstake()}>
        <UnstakeModal
          isOpen={showUnstake()}
          onClose={() => setShowUnstake(false)}
          onSubmit={() => { setShowUnstake(false); refetch(); }}
        />
      </Show>
    </div>
  );
}
