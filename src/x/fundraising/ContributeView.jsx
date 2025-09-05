// src/x/fundraising/ContributeView.jsx
import { createSignal, Show, createResource, createMemo, For } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";
import { getSavvaContract } from "../../blockchain/contracts.js";
import Spinner from "../ui/Spinner.jsx";
import UserCard from "../ui/UserCard.jsx";
import ProgressBar from "../ui/ProgressBar.jsx";
import TokenValue from "../ui/TokenValue.jsx";
import AmountInput from "../ui/AmountInput.jsx";
import { getTokenInfo } from "../../blockchain/tokenMeta.jsx";
import { pushErrorToast, pushToast } from "../../ui/toast.js";
import { connectWallet, walletAccount } from "../../blockchain/wallet.js";
import { authorize } from "../../blockchain/auth.js";
import { whenWsOpen } from "../../net/wsRuntime.js";
import TokenSelector from "./TokenSelector.jsx";
import { createPublicClient, getContract, http } from "viem";
import { getConfigParam } from "../../blockchain/config.js";
import DonatorsList from "./DonatorsList.jsx";

const ERC20_MIN_ABI = [
  { name: "allowance", inputs: [{ type: "address" }, { type: "address" }], outputs: [{ type: "uint256" }], stateMutability: "view", type: "function" },
  { name: "approve", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [{ type: "bool" }], stateMutability: "nonpayable", type: "function" },
];
const MAX_UINT = (1n << 256n) - 1n;

function percentOf(raisedWei, targetWei) {
    if (!targetWei || targetWei <= 0n) return 0;
    const r = BigInt(raisedWei || 0);
    const t = BigInt(targetWei);
    if (t === 0n) return 0;
    const p100 = (r * 10000n) / t;
    return Number(p100) / 100;
}

async function fetchCampaignData({ app, campaignId }) {
    if (!app || !campaignId) return null;
    try {
        const fundraiserContract = await getSavvaContract(app, "Fundraiser");
        
        const [campaignDetailsArray, acceptedTokensList, fee] = await Promise.all([
            fundraiserContract.read.campaigns([campaignId]),
            fundraiserContract.read.getAcceptedTokens(),
            getConfigParam(app, "fundraising_bb_fee")
        ]);
        
        const campaignDetails = {
            title: campaignDetailsArray[0],
            creator: campaignDetailsArray[1],
            targetAmount: campaignDetailsArray[2],
            totalContributed: campaignDetailsArray[3],
        };

        if (!campaignDetails || campaignDetails.targetAmount === 0n) {
            return { error: new Error(app.t("fundraising.contribute.notFoundOrFinished")) };
        }

        const nativeTokenMeta = await getTokenInfo(app, "0");
        const allTokens = [{ address: "0", ...nativeTokenMeta }];

        const acceptedErc20s = await Promise.all(
            acceptedTokensList.map(async (addr) => {
                const meta = await getTokenInfo(app, addr);
                return { address: addr, ...meta };
            })
        );
        allTokens.push(...acceptedErc20s);
        
        await whenWsOpen();
        const getUser = app.wsMethod("get-user");
        const creatorProfile = await getUser({
            domain: app.selectedDomainName(),
            user_addr: campaignDetails.creator
        });

        const creator = { address: campaignDetails.creator, ...creatorProfile };

        return { 
            details: { ...campaignDetails, user: creator },
            acceptedTokens: allTokens,
            fee: fee
        };
    } catch (e) {
        console.error("Failed to fetch campaign data:", e);
        return { error: e };
    }
}

export default function ContributeView(props) {
    const app = useApp();
    const { t } = app;
    const user = () => app.authorizedUser();

    const [data, { refetch }] = createResource(
        () => ({ app, campaignId: props.campaignId }), 
        fetchCampaignData
    );

    const campaign = createMemo(() => data()?.details);
    const campaignError = createMemo(() => data()?.error);
    const acceptedTokens = createMemo(() => data()?.acceptedTokens || []);
    const feePercent = createMemo(() => Number(data()?.fee || 0n) / 100);

    const [selectedToken, setSelectedToken] = createSignal("0");
    const [amountText, setAmountText] = createSignal("");
    const [amountWei, setAmountWei] = createSignal(0n);
    const [isProcessing, setIsProcessing] = createSignal(false);
    const [err, setErr] = createSignal("");

    const targetWei = createMemo(() => campaign()?.targetAmount || 0n);
    const raisedWei = createMemo(() => campaign()?.totalContributed || 0n);
    const percentage = createMemo(() => percentOf(raisedWei(), targetWei()));
    const savvaTokenAddress = () => app.info()?.savva_contracts?.SavvaToken?.address;
    const showDonators = createMemo(() => raisedWei() > 0n);
    
    const handleTokenSelect = (tokenAddress) => {
        setSelectedToken(tokenAddress);
        setAmountText("");
        setAmountWei(0n);
    };

    const handleConnectAndLogin = async () => {
        try {
            if (!walletAccount()) await connectWallet();
            if (!app.authorizedUser()) {
                await app.ensureWalletOnDesiredChain();
                await authorize(app);
            }
        } catch (e) {
            pushErrorToast(e, { context: "Connection failed" });
        }
    };
    
    const handleSubmit = async (e) => {
        e.preventDefault();
        setErr("");
        if (amountWei() <= 0n || !selectedToken()) return;
        
        setIsProcessing(true);
        const toastId = "contrib_toast";

        try {
            const walletClient = await app.getGuardedWalletClient();
            const publicClient = createPublicClient({ chain: app.desiredChain(), transport: http(app.desiredChain().rpcUrls[0]) });
            const fundraiserContract = await getSavvaContract(app, "Fundraiser", { write: true });
            let txHash;
            const isBase = selectedToken() === "0";
            
            if (isBase) {
                pushToast({ type: "info", message: t("fundraising.contribute.toast.sending"), id: toastId, autohideMs: 0 });
                txHash = await fundraiserContract.write.contribute([props.campaignId, "0x0000000000000000000000000000000000000000", amountWei()], { value: amountWei() });
            } else {
                const tokenContract = getContract({ address: selectedToken(), abi: ERC20_MIN_ABI, client: walletClient });
                const allowance = await tokenContract.read.allowance([user().address, fundraiserContract.address]);

                if (allowance < amountWei()) {
                    pushToast({ type: "info", message: t("fundraising.contribute.toast.approving"), id: toastId, autohideMs: 0 });
                    const approveHash = await tokenContract.write.approve([fundraiserContract.address, MAX_UINT]);
                    await publicClient.waitForTransactionReceipt({ hash: approveHash });
                }
                
                pushToast({ type: "info", message: t("fundraising.contribute.toast.sending"), id: toastId, autohideMs: 0 });
                txHash = await fundraiserContract.write.contribute([props.campaignId, selectedToken(), amountWei()]);
            }
            
            await publicClient.waitForTransactionReceipt({ hash: txHash });
            app.dismissToast(toastId);
            pushToast({ type: "success", message: t("fundraising.contribute.toast.success") });
            
            refetch();
            props.onSuccess?.();
        } catch (error) {
            setErr(error.shortMessage || error.message);
            pushErrorToast(error, { context: t("fundraising.contribute.toast.error") });
        } finally {
            app.dismissToast(toastId);
            setIsProcessing(false);
        }
    };

    return (
        <Show when={user()} fallback={
            <div class="p-8 text-center">
                <h3 class="text-lg font-semibold">{t("fundraising.contribute.connectTitle")}</h3>
                <p class="mt-2 text-sm text-[hsl(var(--muted-foreground))]">{t("fundraising.contribute.connectMessage")}</p>
                <button class="mt-4 px-4 py-2 rounded bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90" onClick={handleConnectAndLogin}>
                    {t("wallet.connect")}
                </button>
            </div>
        }>
            <form onSubmit={handleSubmit} class="p-4">
                 <div
                    class="grid grid-cols-1 gap-6 min-h-[480px]"
                    classList={{ "md:grid-cols-3": showDonators() }}
                >
                    <div classList={{ "md:col-span-2": showDonators() }}>
                        <Show when={!data.loading && !campaignError()} fallback={
                            <div class="flex justify-center p-8 h-full items-center">
                                <Show when={!campaignError()} fallback={<p class="text-sm text-[hsl(var(--destructive))]">{campaignError().message}</p>}>
                                    <Spinner />
                                </Show>
                            </div>
                        }>
                            <div class="space-y-4">
                                <div class="p-3 rounded bg-[hsl(var(--muted))] space-y-2">
                                    <p class="text-sm font-semibold line-clamp-2">{campaign()?.title}</p>
                                    <div>
                                        <div class="text-xs text-[hsl(var(--muted-foreground))] mb-1">{t("fundraising.contribute.receiver")}:</div>
                                        <UserCard author={campaign()?.user} />
                                    </div>
                                </div>
                                
                                <div class="space-y-2 text-sm">
                                    <div class="flex justify-between items-center">
                                        <span class="text-[hsl(var(--muted-foreground))]">{t("fundraising.card.collected")}:</span>
                                        <TokenValue amount={raisedWei()} tokenAddress={savvaTokenAddress()} />
                                    </div>
                                    <ProgressBar value={percentage()} />
                                    <div class="flex justify-between items-center">
                                        <span class="text-[hsl(var(--muted-foreground))]">{t("fundraising.card.target")}:</span>
                                        <TokenValue amount={targetWei()} tokenAddress={savvaTokenAddress()} />
                                    </div>
                                </div>

                                <div class="pt-2 border-t border-[hsl(var(--border))] space-y-4">
                                    <TokenSelector
                                        label={t("fundraising.contribute.token")}
                                        tokens={acceptedTokens()}
                                        selectedValue={selectedToken()}
                                        onChange={handleTokenSelect}
                                    />

                                    <AmountInput
                                        label={t("fundraising.contribute.amount")}
                                        tokenAddress={selectedToken()}
                                        value={amountText()}
                                        onInput={(txt, wei) => { setAmountText(txt); setAmountWei(wei ?? 0n); }}
                                    />
                                </div>
                            </div>
                        </Show>
                    </div>
                    
                    <Show when={showDonators()}>
                        <div class="md:col-span-1 h-full">
                            <DonatorsList campaignId={props.campaignId} savvaTokenAddress={savvaTokenAddress()} />
                        </div>
                    </Show>
                </div>
                
                <Show when={err()}>
                    <p class="text-sm text-[hsl(var(--destructive))] mt-4">{err()}</p>
                </Show>

                <div class="pt-4 mt-4 border-t border-[hsl(var(--border))] space-y-3">
                    <Show when={feePercent() > 0}>
                        <p class="text-xs text-center text-[hsl(var(--muted-foreground))]">
                            {t("fundraising.contribute.feeNotice", { n: feePercent() })}
                        </p>
                    </Show>
                    <div class="flex justify-end gap-2">
                         <Show when={props.showCancel}>
                            <button type="button" onClick={props.onCancel} class="px-4 py-2 rounded border border-[hsl(var(--border))] hover:bg-[hsl(var(--accent))] disabled:opacity-50">
                                {t("common.cancel")}
                            </button>
                        </Show>
                        <button type="submit" disabled={isProcessing() || amountWei() <= 0n || !selectedToken()} class="px-4 py-2 min-w-[140px] flex items-center justify-center rounded bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90 disabled:opacity-60">
                            <Show when={isProcessing()} fallback={t("fundraising.card.contribute")}>
                                <Spinner class="w-5 h-5" />
                            </Show>
                        </button>
                    </div>
                </div>
            </form>
        </Show>
    );
}
