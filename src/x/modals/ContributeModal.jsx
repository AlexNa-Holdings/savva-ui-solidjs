// src/x/modals/ContributeModal.jsx
import { createSignal, Show, createResource, createMemo, For } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";
import AmountInput from "../ui/AmountInput.jsx";
import { getTokenInfo } from "../../blockchain/tokenMeta.jsx";
import { getSavvaContract } from "../../blockchain/contracts.js";
import { parseUnits, formatUnits } from "viem";
import { getConfigParam } from "../../blockchain/config.js";
import Spinner from "../ui/Spinner.jsx";
import { pushToast, pushErrorToast } from "../../ui/toast.js";
import { sendAsActor } from "../../blockchain/npoMulticall.js";
import Modal from "./Modal.jsx";
import { useProfileByCid, selectField } from "../profile/userProfileStore.js";
import { loadPredefinedAmounts } from "../preferences/storage.js";

export default function ContributeModal(props) {
  const app = useApp();
  const { t } = app;

  const MAX_UINT = (1n << 256n) - 1n;

  const [amountText, setAmountText] = createSignal("");
  const [amountWei, setAmountWei] = createSignal(0n);
  const [isProcessing, setIsProcessing] = createSignal(false);

  const actorAddr = () => app.actorAddress?.() || app.authorizedUser?.()?.address || "";

  const actorProfileCid = createMemo(() => app.actorProfile?.()?.profile_cid || app.authorizedUser?.()?.profile_cid);
  const { dataStable: actorProfile } = useProfileByCid(actorProfileCid);

  const [donationInfo] = createResource(
    () => ({ post: props.post }),
    async ({ post }) => {
      if (!app) return { percentage: 0, hasNft: false };
      try {
        const hasNft = post?.nft?.owner && post.nft.owner !== "0x0000000000000000000000000000000000000000";
        const authorShare = await getConfigParam(app, "authorShare");
        let total = Number(authorShare || 0);
        if (hasNft) {
          const nftOwnerCut = await getConfigParam(app, "nftOwnerCut");
          total += Number(nftOwnerCut || 0);
        }
        return { percentage: total / 100, hasNft };
      } catch {
        return { percentage: 0, hasNft: false };
      }
    }
  );

  const [minContributionRaw] = createResource(
    () => ({ app }),
    async ({ app }) => {
      try {
        const v = await getConfigParam(app, "minContribution");
        return v ?? "0";
      } catch {
        return "0";
      }
    }
  );

  const savvaTokenAddress = () => app.info()?.savva_contracts?.SavvaToken?.address || "";
  const [savvaMeta] = createResource(
    () => ({ app, addr: savvaTokenAddress() }),
    ({ app, addr }) => getTokenInfo(app, addr)
  );
  const savvaDecimals = () => Number(savvaMeta()?.decimals ?? 18);
  const savvaSymbol = () => savvaMeta()?.symbol || "SAVVA";

  const minWei = createMemo(() => {
    try {
      const raw = minContributionRaw();
      if (raw === undefined || raw === null) return 0n;
      if (typeof raw === "bigint") return raw;
      const s = String(raw).trim();
      if (!s) return 0n;
      if (s.includes(".") || /e/i.test(s)) return parseUnits(s, savvaDecimals());
      const bi = BigInt(s);
      const tenPow = 10n ** BigInt(savvaDecimals());
      if (bi >= tenPow / 1000n) return bi;
      return parseUnits(s, savvaDecimals());
    } catch {
      return 0n;
    }
  });

  const belowMin = createMemo(() => {
    const amt = amountWei();
    const min = minWei();
    return min > 0n && amt > 0n && amt < min;
  });

  const predefinedAmounts = createMemo(() => {
    return loadPredefinedAmounts().filter((v) => Number(v) > 0);
  });

  const handlePredefinedClick = (amount) => {
    const text = String(amount);
    setAmountText(text);
    try {
      const wei = parseUnits(text, savvaDecimals());
      setAmountWei(wei);
    } catch {}
  };

  const handleSubmit = async (e) => {
    e?.preventDefault?.();
    if (amountWei() <= 0n || belowMin()) return;
    if (!props.post || !props.post.author?.address || !props.post.domain || !props.post.guid) {
      pushErrorToast({ message: t("post.fund.toast.error") });
      return;
    }

    setIsProcessing(true);
    let mainToastId, approveToastId, contribToastId;

    try {
      mainToastId = pushToast({ type: "info", message: t("post.fund.toast.pending"), autohideMs: 0 });

      const tokenContract = await getSavvaContract(app, "SavvaToken");
      const fundContract = await getSavvaContract(app, "ContentFund");
      const owner = actorAddr();
      const spender = fundContract.address;
      const allowance = await tokenContract.read.allowance([owner, spender]);

      if (allowance < amountWei()) {
        approveToastId = pushToast({ type: "info", message: t("post.fund.toast.approving"), autohideMs: 0 });
        await sendAsActor(app, {
          contractName: "SavvaToken",
          functionName: "approve",
          args: [spender, MAX_UINT],
        });
      }

      contribToastId = pushToast({ type: "info", message: t("post.fund.toast.contributing"), autohideMs: 0 });

      const { author, domain, guid } = props.post;
      await sendAsActor(app, {
        contractName: "ContentFund",
        functionName: "contribute",
        args: [author.address, domain, guid, amountWei()],
      });

      pushToast({ type: "success", message: t("post.fund.toast.success") });
      props.onClose?.();
      app.triggerWalletDataRefresh?.();
    } catch (error) {
      pushErrorToast(error, { context: t("post.fund.toast.error") });
    } finally {
      if (mainToastId) app.dismissToast?.(mainToastId);
      if (approveToastId) app.dismissToast?.(approveToastId);
      if (contribToastId) app.dismissToast?.(contribToastId);
      setIsProcessing(false);
    }
  };

  const minDisplay = createMemo(() => {
    try {
      return `${formatUnits(minWei(), savvaDecimals())} ${savvaSymbol()}`;
    } catch {
      return `0 ${savvaSymbol()}`;
    }
  });

  return (
    <Modal
      isOpen={props.isOpen}
      onClose={props.onClose}
      title={t("post.fund.contribute")}
      size="md"
      footer={
        <div class="flex justify-end gap-2">
          <button
            type="button"
            onClick={props.onClose}
            disabled={isProcessing()}
            class="px-4 py-2 rounded border border-[hsl(var(--border))] hover:bg-[hsl(var(--accent))] disabled:opacity-50"
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            onClick={() => handleSubmit()}
            disabled={isProcessing() || amountWei() <= 0n || belowMin()}
            class="px-4 py-2 min-w-[120px] flex items-center justify-center rounded bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90 disabled:opacity-60"
          >
            <Show when={isProcessing()} fallback={t("post.fund.contribute")}>
              <Spinner class="w-5 h-5" />
            </Show>
          </button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} class="space-y-4">
        <p class="text-xs text-left text-[hsl(var(--muted-foreground))]">{t("post.fund.explanation")}</p>

        <AmountInput
          label={t("wallet.transfer.amount")}
          tokenAddress={savvaTokenAddress()}
          value={amountText()}
          onInput={(txt, wei) => {
            setAmountText(txt);
            if (wei !== undefined) setAmountWei(wei);
          }}
        />

        <Show when={belowMin()}>
          <p class="text-xs mt-1 text-[hsl(var(--destructive))]">
            {t("post.fund.minContributionError", { n: minDisplay() })}
          </p>
        </Show>

        <Show when={predefinedAmounts().length > 0}>
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
          <Show when={!donationInfo.loading} fallback={<Spinner />}>
            <p class="text-xs text-left text-[hsl(var(--muted-foreground))]">
              {donationInfo()?.hasNft
                ? t("post.fund.confirmation", { n: donationInfo()?.percentage || "N/A" })
                : t("post.fund.confirmation_no_nft", { n: donationInfo()?.percentage || "N/A" })}
            </p>
          </Show>
        </div>
      </form>
    </Modal>
  );
}
