// src/x/post/ContributeModal.jsx
import { createSignal, Show, createResource, createMemo, For } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";
import AmountInput from "../ui/AmountInput.jsx";
import { getTokenInfo } from "../../blockchain/tokenMeta.js";
import { ipfs } from "../../ipfs/index.js";
import { getSavvaContract } from "../../blockchain/contracts.js";
import { toHexBytes32 } from "../../blockchain/utils.js";
import { createPublicClient, http, parseUnits } from "viem";
import { getConfigParam } from "../../blockchain/config.js";
import Spinner from "../ui/Spinner.jsx";
import { pushToast, pushErrorToast } from "../../ui/toast.js";

async function fetchProfileDetails(params) {
    const { app, userAddress } = params;
    if (!app || !userAddress) return null;
    try {
        const userProfileContract = await getSavvaContract(app, 'UserProfile');
        const profileCid = await userProfileContract.read.getString([
            userAddress,
            toHexBytes32(app.selectedDomainName()), // Use current domain
            toHexBytes32("profile_cid")
        ]);
        if (!profileCid) return null;

        const { data } = await ipfs.getJSONBest(app, profileCid);
        return data || {};
    } catch (e) {
        console.error("Failed to fetch profile details for modal:", e);
        return null;
    }
}

export default function ContributeModal(props) {
    const app = useApp();
    const { t } = app;
    const user = () => app.authorizedUser();
    const MAX_UINT = (1n << 256n) - 1n;

    const [amountText, setAmountText] = createSignal("");
    const [amountWei, setAmountWei] = createSignal(0n);
    const [isProcessing, setIsProcessing] = createSignal(false);
    
    const [profileDetails] = createResource(() => ({ app, userAddress: user()?.address }), fetchProfileDetails);

    const [donationInfo] = createResource(
      () => ({ post: props.post }),
      async ({ post }) => {
        if (!app) return { percentage: 0, hasNft: false };
        try {
            const hasNft = post?.nft?.owner && post.nft.owner !== '0x0000000000000000000000000000000000000000';
            const authorShare = await getConfigParam(app, 'authorShare');
            let total = Number(authorShare || 0);

            if (hasNft) {
                const nftOwnerCut = await getConfigParam(app, 'nftOwnerCut');
                total += Number(nftOwnerCut || 0);
            }
            
            return { percentage: total / 100, hasNft };
        } catch (e) {
            console.error("Failed to get donation percentages", e);
            return { percentage: 0, hasNft: false };
        }
    });

    const predefinedAmounts = createMemo(() => {
        const values = profileDetails()?.sponsor_values;
        return Array.isArray(values) ? values.filter(v => v > 0) : [];
    });

    const savvaTokenAddress = () => app.info()?.savva_contracts?.SavvaToken?.address || "";
    const [savvaMeta] = createResource(() => ({ app, addr: savvaTokenAddress() }), ({ app, addr }) => getTokenInfo(app, addr));
    const savvaDecimals = () => Number(savvaMeta()?.decimals ?? 18);

    const handlePredefinedClick = (amount) => {
        const text = String(amount);
        setAmountText(text);
        try {
            const wei = parseUnits(text, savvaDecimals());
            setAmountWei(wei);
        } catch {}
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (amountWei() <= 0n) return;
        setIsProcessing(true);

        const mainToastId = "contribute_toast";
        pushToast({
            type: "info",
            message: t("post.fund.toast.pending"),
            autohideMs: 0,
            id: mainToastId
        });

        const approveToastId = "approve_toast";
        const contribToastId = "contrib_toast";

        try {
            const walletClient = await app.getGuardedWalletClient();
            const publicClient = createPublicClient({ chain: app.desiredChain(), transport: http(app.desiredChain().rpcUrls[0]) });

            const tokenContract = await getSavvaContract(app, "SavvaToken", { write: true });
            const fundContract = await getSavvaContract(app, "ContentFund", { write: true });

            const allowance = await tokenContract.read.allowance([user().address, fundContract.address]);
            
            if (allowance < amountWei()) {
                pushToast({ type: "info", message: t("post.fund.toast.approving"), autohideMs: 0, id: approveToastId });
                const approveHash = await tokenContract.write.approve([fundContract.address, MAX_UINT]);
                const approveReceipt = await publicClient.waitForTransactionReceipt({ hash: approveHash });
                app.dismissToast?.(approveToastId);
                if (approveReceipt.status !== 'success') {
                  throw new Error("Token approval transaction failed.");
                }
            }

            pushToast({ type: "info", message: t("post.fund.toast.contributing"), autohideMs: 0, id: contribToastId });
            
            if (!props.post || !props.post.author?.address || !props.post.domain || !props.post.guid) {
                throw new Error("Post data is incomplete. Cannot contribute.");
            }
            const { author, domain, guid } = props.post;

            const contributeHash = await fundContract.write.contribute([author.address, domain, guid, amountWei()]);
            const contributeReceipt = await publicClient.waitForTransactionReceipt({ hash: contributeHash });
            
            if (contributeReceipt.status !== 'success') {
                throw new Error("Contribution transaction failed.");
            }

            app.dismissToast?.(contribToastId);
            app.dismissToast?.(mainToastId);
            pushToast({ type: "success", message: t("post.fund.toast.success") });
            props.onClose?.();
            app.triggerWalletDataRefresh?.();

        } catch (error) {
            pushErrorToast(error, { context: t("post.fund.toast.error") });
        } finally {
            app.dismissToast?.(mainToastId);
            app.dismissToast?.(approveToastId);
            app.dismissToast?.(contribToastId);
            setIsProcessing(false);
        }
    };

    return (
        <Show when={props.isOpen}>
            <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
                <div class="absolute inset-0 bg-black/40" onClick={() => !isProcessing() && props.onClose?.()} />
                <form
                    onSubmit={handleSubmit}
                    class="relative w-full max-w-md rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[hsl(var(--card-foreground))] shadow-lg p-4 space-y-4"
                >
                    <h3 class="text-lg font-semibold text-center uppercase">{t("post.fund.contribute")}</h3>

                    <p class="text-xs text-left text-[hsl(var(--muted-foreground))]">
                        {t("post.fund.explanation")}
                    </p>

                    <AmountInput
                        label={t("wallet.transfer.amount")}
                        tokenAddress={savvaTokenAddress()}
                        value={amountText()}
                        onInput={(txt, wei) => {
                            setAmountText(txt);
                            if(wei !== undefined) setAmountWei(wei);
                        }}
                    />

                    <Show when={!profileDetails.loading && predefinedAmounts().length > 0}>
                        <div class="space-y-2 pt-2">
                            <h4 class="text-sm font-medium">{t("post.fund.predefinedAmounts")}</h4>
                            <div class="flex gap-2">
                                <For each={predefinedAmounts()}>
                                    {(amount) => (
                                        <button
                                            type="button"
                                            onClick={() => handlePredefinedClick(amount)}
                                            class="flex-1 text-center px-3 py-1.5 text-sm rounded bg-[hsl(var(--secondary))] text-[hsl(var(--secondary-foreground))] hover:opacity-90"
                                        >
                                            {amount}
                                        </button>
                                    )}
                                </For>
                            </div>
                        </div>
                    </Show>

                    <div class="pt-2 space-y-3">
                         <Show when={!donationInfo.loading} fallback={<Spinner/>}>
                            <p class="text-xs text-left text-[hsl(var(--muted-foreground))]">
                                {donationInfo()?.hasNft 
                                    ? t("post.fund.confirmation", { n: donationInfo()?.percentage || 'N/A' })
                                    : t("post.fund.confirmation_no_nft", { n: donationInfo()?.percentage || 'N/A' })
                                }
                            </p>
                        </Show>
                        <div class="flex justify-end gap-2">
                            <button type="button" onClick={props.onClose} disabled={isProcessing()} class="px-4 py-2 rounded border border-[hsl(var(--border))] hover:bg-[hsl(var(--accent))] disabled:opacity-50">
                                {t("common.cancel")}
                            </button>
                            <button type="submit" disabled={isProcessing() || amountWei() <= 0n} class="px-4 py-2 min-w-[120px] flex items-center justify-center rounded bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90 disabled:opacity-60">
                                <Show when={isProcessing()} fallback={t("post.fund.contribute")}>
                                    <Spinner class="w-5 h-5"/>
                                </Show>
                            </button>
                        </div>
                    </div>
                </form>
            </div>
        </Show>
    );
}