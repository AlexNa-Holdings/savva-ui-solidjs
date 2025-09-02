// src/components/profile/UnstakeModal.jsx
import { createSignal, Show, createResource } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";
import AmountInput from "../ui/AmountInput.jsx";
import Spinner from "../ui/Spinner.jsx";
import { getSavvaContract } from "../../blockchain/contracts.js";
import { createPublicClient, http } from "viem";

export default function UnstakeModal(props) {
  const app = useApp();
  const { t } = app;

  const user = () => app.authorizedUser();
  const [amountText, setAmountText] = createSignal("");
  const [amountWei, setAmountWei] = createSignal(null);
  const [err, setErr] = createSignal("");
  const [isProcessing, setIsProcessing] = createSignal(false);

  const [staked] = createResource(
    () => ({ app, userAddress: user()?.address }),
    async ({ app, userAddress }) => {
      if (!app || !userAddress) return 0n;
      const staking = await getSavvaContract(app, "Staking");
      return staking.read.balanceOf([userAddress]); // ERC20-like balanceOf
    }
  );

  const close = () => { if (!isProcessing()) props.onClose?.(); };

  function validate() {
    if (!amountWei() || amountWei() <= 0n) return t("wallet.transfer.errors.badAmount");
    if (staked() != null && amountWei() > (staked() || 0n)) return t("wallet.stake.errors.insufficientBalance");
    return "";
  }

  async function submit(e) {
    e?.preventDefault?.();
    const msg = validate();
    if (msg) { setErr(msg); return; }
    setErr("");
    setIsProcessing(true);

    try {
      const staking = await getSavvaContract(app, "Staking", { write: true });
      const publicClient = createPublicClient({ chain: app.desiredChain(), transport: http(app.desiredChain().rpcUrls[0]) });

      const hash = await staking.write.unstake([amountWei()]); // ABI has unstake(uint256) :contentReference[oaicite:0]{index=0}
      await publicClient.waitForTransactionReceipt({ hash });
      props.onSubmit?.();
      setIsProcessing(false);
      close();
    } catch (e) {
      console.error("unstake failed:", e);
      setIsProcessing(false);
    }
  }

  return (
    <div class="fixed inset-0 z-50 flex items-center justify-center">
      <div class="absolute inset-0 bg-black/40" onClick={close} />
      <form onSubmit={submit} class="relative w-full max-w-md rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[hsl(var(--card-foreground))] shadow-lg p-4 space-y-4">
        <h3 class="text-lg font-semibold">{t("wallet.unstake.title")}</h3>

        <Show when={!staked.loading} fallback={<div class="flex justify-center p-6"><Spinner /></div>}>
          <div class="text-sm opacity-70">
            {t("wallet.staked.title")}: {String(staked() || 0n)}
          </div>
        </Show>

        <AmountInput
          value={amountText()}
          onInput={(txt, wei) => { setAmountText(txt); setAmountWei(wei); }}
          placeholder={t("wallet.unstake.amount")}
        />

        <Show when={err()}>
          <div class="text-sm text-[hsl(var(--destructive))]">{err()}</div>
        </Show>

        <div class="flex justify-end gap-2 pt-1">
          <button type="button" class="px-3 py-2 rounded border border-[hsl(var(--border))] hover:bg-[hsl(var(--accent))]" onClick={close}>
            {t("common.cancel")}
          </button>
          <button type="submit" disabled={isProcessing()} class="px-3 py-2 rounded bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90 disabled:opacity-60">
            <Show when={!isProcessing()} fallback={<Spinner class="w-5 h-5" />}>
              {t("wallet.unstake.submit")}
            </Show>
          </button>
        </div>
      </form>
    </div>
  );
}
