// src/x/fundraising/NewFundraisingModal.jsx
import { createSignal, createResource, Show, createMemo } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";
import AmountInput from "../ui/AmountInput.jsx";
import TokenValue from "../ui/TokenValue.jsx";
import Spinner from "../ui/Spinner.jsx";
import { getConfigParam } from "../../blockchain/config.js";
import { getSavvaContract } from "../../blockchain/contracts.js";
import { pushToast, pushErrorToast } from "../../ui/toast.js";
import { sendAsActor } from "../../blockchain/npoMulticall.js";
import ModalAutoCloser from "../modals/ModalAutoCloser.jsx";
import ModalBackdrop from "../modals/ModalBackdrop.jsx";
import { Portal } from "solid-js/web";

async function fetchStakeCheck({ app, actorAddress }) {
  if (!actorAddress) return { hasEnoughStake: false, minStakeWei: 0n };
  try {
    const minStakeWei = await getConfigParam(app, "min_staked_for_fundrasing");
    const stakingContract = await getSavvaContract(app, "Staking");
    const userStakeWei = await stakingContract.read.balanceOf([actorAddress]);
    const hasEnoughStake = userStakeWei >= minStakeWei;
    return { minStakeWei, userStakeWei, hasEnoughStake };
  } catch (e) {
    console.error("Stake check failed:", e);
    return { hasEnoughStake: false, minStakeWei: 0n, error: e };
  }
}

export default function NewFundraisingModal(props) {
  const app = useApp();
  const { t } = app;

  // Actor-aware subject (self or selected NPO)
  const actorAddr = () => app.actorAddress?.() || app.authorizedUser?.()?.address || "";

  const [title, setTitle] = createSignal("");
  const [amountText, setAmountText] = createSignal("");
  const [amountWei, setAmountWei] = createSignal(0n);
  const [isProcessing, setIsProcessing] = createSignal(false);

  const [stakeCheck] = createResource(
    () => ({ app, actorAddress: actorAddr() }),
    fetchStakeCheck
  );
  const canCreate = createMemo(() => !!stakeCheck()?.hasEnoughStake);

  const savvaTokenAddress = () => app.info()?.savva_contracts?.SavvaToken?.address || "";
  const stakingTokenAddress = () => app.info()?.savva_contracts?.Staking?.address || "";

  const MAX_TITLE_LENGTH = 256;
  const charsLeft = createMemo(() => MAX_TITLE_LENGTH - title().length);

  const resetForm = () => {
    setTitle("");
    setAmountText("");
    setAmountWei(0n);
  };

  const handleClose = () => {
    if (isProcessing()) return;
    resetForm();
    props.onClose?.();
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!canCreate() || isProcessing() || !title().trim() || amountWei() <= 0n) return;

    setIsProcessing(true);
    try {
      // Create fundraiser via ACTOR (NPO => SavvaNPO.multicall; self => direct)
      await sendAsActor(app, {
        contractName: "Fundraiser",
        functionName: "createCampaign",
        args: [title().trim(), amountWei()],
      });

      pushToast({ type: "success", message: t("fundraising.createModal.toast.success") });
      props.onSuccess?.();

      setIsProcessing(false);
      handleClose();
    } catch (err) {
      setIsProcessing(false);
      pushErrorToast(err, { context: t("fundraising.createModal.toast.error") });
    }
  };

  return (
    <Show when={props.isOpen}>
      <Portal>
        <div class="fixed inset-0 z-60 flex items-center justify-center p-4">
          <ModalBackdrop onClick={props.onClose} />
          <div class="relative z-70 w-full max-w-md rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[hsl(var(--card-foreground))] shadow-lg">
            <form onSubmit={handleCreate} class="p-4 space-y-4">
              <ModalAutoCloser onClose={props.onClose} />
              <h3 class="text-lg font-semibold">{t("fundraising.createModal.title")}</h3>

              <Show
                when={stakeCheck.loading}
                fallback={
                  <Show when={!canCreate()}>
                    <div class="p-3 text-sm text-center rounded bg-[hsl(var(--muted))]">
                      <span>{t("fundraising.createModal.insufficientStake.message")}&nbsp;</span>
                      <TokenValue amount={stakeCheck()?.minStakeWei} tokenAddress={stakingTokenAddress()} />
                    </div>
                  </Show>
                }
              >
                <div class="flex justify-center p-4"><Spinner /></div>
              </Show>

              <div>
                <label for="campaign-title" class="text-sm font-medium">
                  {t("fundraising.createModal.title.label")}
                </label>
                <div class="relative">
                  <textarea
                    id="campaign-title"
                    rows="4"
                    maxLength={MAX_TITLE_LENGTH}
                    value={title()}
                    onInput={(e) => setTitle(e.currentTarget.value)}
                    disabled={!canCreate()}
                    class="mt-1 w-full px-3 py-2 rounded border bg-[hsl(var(--background))] text-[hsl(var(--foreground))] border-[hsl(var(--input))] resize-none"
                  />
                  <div class="absolute right-2 bottom-2 text-xs text-[hsl(var(--muted-foreground))]">
                    {charsLeft()}
                  </div>
                </div>
              </div>

              <AmountInput
                label={t("fundraising.createModal.target.label")}
                tokenAddress={savvaTokenAddress()}
                value={amountText()}
                onInput={(txt, wei) => {
                  setAmountText(txt);
                  setAmountWei(wei ?? 0n);
                }}
                disabled={!canCreate()}
              />

              <div class="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleClose}
                  class="px-4 py-2 rounded border border-[hsl(var(--border))] hover:bg-[hsl(var(--accent))] disabled:opacity-50"
                >
                  {t("common.cancel")}
                </button>
                <button
                  type="submit"
                  disabled={!canCreate() || isProcessing() || !title().trim() || amountWei() <= 0n}
                  class="px-4 py-2 min-w-[140px] flex items-center justify-center rounded bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90 disabled:opacity-60"
                >
                  <Show when={isProcessing()} fallback={t("fundraising.createModal.createButton")}>
                    <Spinner class="w-5 h-5" />
                  </Show>
                </button>
              </div>
            </form>
          </div>
        </div>
      </Portal>
    </Show>
  );
}
