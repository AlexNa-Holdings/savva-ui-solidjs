// src/components/profile/WalletTab.jsx
import { useApp } from "../../context/AppContext.jsx";
import TokenValue from "../ui/TokenValue.jsx";
import { createMemo, createResource, Show } from "solid-js";
import { getSavvaContract } from "../../blockchain/contracts.js";
import { createPublicClient, http } from "viem";
import Spinner from "../ui/Spinner.jsx";
import RefreshIcon from "../ui/icons/RefreshIcon.jsx";

async function fetchWalletData({ app, user }) {
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
      stakingReward
    ] = await Promise.all([
      savvaTokenContract.read.balanceOf([user.address]),
      publicClient.getBalance({ address: user.address }),
      contentFundContract.read.claimableNftGain([user.address]),
      stakingContract.read.balanceOf([user.address]),
      stakingContract.read.claimable([user.address])
    ]);

    return { savvaBalance, baseTokenBalance, nftEarnings, stakedBalance, stakingReward };
  } catch (error) {
    console.error("Failed to fetch wallet data:", error);
    return { error };
  }
}

const WalletSection = (props) => (
  <section class="bg-[hsl(var(--card))] text-[hsl(var(--card-foreground))] rounded-lg shadow p-4 space-y-3">
    <div class="flex justify-between items-center">
        <h3 class="text-lg font-medium">{props.title}</h3>
        <Show when={props.headerAction}>
            <div>{props.headerAction}</div>
        </Show>
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
      <div class="flex-shrink-0">
        <TokenValue amount={props.amount || "0"} format="vertical" tokenAddress={props.tokenAddress} />
      </div>
    </div>
  </div>
);

export default function WalletTab(props) {
  const app = useApp();
  const { t } = app;
  const [walletData, { refetch }] = createResource(() => ({ app, user: props.user }), fetchWalletData);

  const desiredChain = createMemo(() => app.desiredChain());
  const baseTokenSymbol = createMemo(() => desiredChain()?.nativeCurrency?.symbol || "PLS");
  
  const RefreshButton = () => (
    <button onClick={refetch} disabled={walletData.loading} class="p-1.5 rounded-full text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))] hover:text-[hsl(var(--foreground))] disabled:opacity-50 disabled:cursor-not-allowed">
        <RefreshIcon class="w-5 h-5" />
    </button>
  );
  
  return (
    <div class="px-2 space-y-6">
      <Show when={!walletData.loading} fallback={<div class="flex justify-center p-8"><Spinner /></div>}>
        <Show when={!walletData.error} fallback={<p class="text-sm text-center text-[hsl(var(--destructive))]">{t("common.error")}: {walletData.error.message}</p>}>
            <WalletSection title={t("profile.wallet.balances.title")} headerAction={<RefreshButton />}>
                <WalletRow 
                    title={t("profile.wallet.savva.title")}
                    description={t("profile.wallet.savva.description")}
                    amount={walletData()?.savvaBalance}
                />
                <WalletRow 
                    title={baseTokenSymbol()}
                    description={t("profile.wallet.pls.description")}
                    amount={walletData()?.baseTokenBalance}
                    tokenAddress="0"
                />
            </WalletSection>
          
            <WalletSection title={t("profile.wallet.nft.title")}>
                <WalletRow 
                    title={t("profile.wallet.nftEarnings.title")}
                    description={t("profile.wallet.nftEarnings.description")}
                    amount={walletData()?.nftEarnings}
                />
            </WalletSection>

            <WalletSection title={t("profile.wallet.staking.title")}>
                <WalletRow 
                    title={t("profile.wallet.staked.title")}
                    description={t("profile.wallet.staked.description")}
                    amount={walletData()?.stakedBalance}
                />
                <WalletRow 
                    title={t("profile.wallet.reward.title")}
                    description={t("profile.wallet.reward.description")}
                    amount={walletData()?.stakingReward}
                />
            </WalletSection>
        </Show>
      </Show>
    </div>
  );
}