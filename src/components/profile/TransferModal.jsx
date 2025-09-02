// src/components/profile/TransferModal.jsx
import { createSignal, Show, createResource } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";
import AddressInput from "../ui/AddressInput.jsx";
import AmountInput from "../ui/AmountInput.jsx";
import SavvaTokenIcon from "../ui/icons/SavvaTokenIcon.jsx";
import { getChainLogo } from "../../blockchain/chainLogos.js";
import { getTokenInfo } from "../../blockchain/tokenMeta.js";
import { performTransfer } from "../../blockchain/transactions.js";
import Spinner from "../ui/Spinner.jsx";

function TokenTitleIcon({ app, tokenAddress, className = "w-5 h-5" }) {
  const chainId = app.desiredChain?.()?.id;
  const savvaAddr = (app.info()?.savva_contracts?.SavvaToken?.address || "").toLowerCase();
  const base = !tokenAddress;

  if (base) {
    const ChainLogo = getChainLogo(chainId);
    return ChainLogo ? <ChainLogo class={className} /> : null;
  }
  if ((tokenAddress || "").toLowerCase() === savvaAddr) {
    return <SavvaTokenIcon class={className} />;
  }
  return null;
}

export default function TransferModal(props) {
  const app = useApp();
  const { t } = app;

  const [to, setTo] = createSignal(String(props.to || ""));
  const [amountText, setAmountText] = createSignal("");
  const [amountWei, setAmountWei] = createSignal(null);
  const [err, setErr] = createSignal("");
  const [isProcessing, setIsProcessing] = createSignal(false);

  const close = () => {
    if (isProcessing()) return;
    props.onClose?.();
  };

  const [meta] = createResource(
    () => ({ app, addr: props.tokenAddress ? String(props.tokenAddress) : "" }),
    ({ app, addr }) => getTokenInfo(app, addr)
  );

  function validate() {
    const a = String(amountText()).trim();
    const v = Number(a || "0");
    const addr = String(to()).trim();
    if (!addr || !(addr.startsWith("0x") && addr.length === 42)) {
      return t("wallet.transfer.errors.badAddress");
    }
    if (!(v > 0) || amountWei() === null) return t("wallet.transfer.errors.badAmount");
    return "";
  }

  async function submit(e) {
    e?.preventDefault?.();
    const msg = validate();
    if (msg) { setErr(msg); return; }
    setErr("");
    setIsProcessing(true);

    const txData = {
      to: to().trim(),
      amountWei: amountWei(),
      tokenAddress: props.tokenAddress || "",
    };

    try {
      await performTransfer(app, txData);
      props.onSubmit?.(txData);
      // ✅ clear busy state BEFORE closing so the guard doesn't block
      setIsProcessing(false);
      close();
    } catch (e) {
      // Error toast is shown inside performTransfer; keep dialog open
      setIsProcessing(false);
    }
  }

  return (
    <div class="fixed inset-0 z-50 flex items-center justify-center">
      <div class="absolute inset-0 bg-black/40" onClick={close} />
      <div class="relative w-full max-w-md rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[hsl(var(--card-foreground))] shadow-lg">
        <form onSubmit={submit} class="p-4 space-y-4">
          <div class="text-lg font-semibold flex items-center gap-2">
            <TokenTitleIcon app={app} tokenAddress={props.tokenAddress || ""} />
            <span>{t("wallet.transfer.titleToken")}</span>
            <Show when={meta()?.symbol}>
              <span class="text-sm text-[hsl(var(--muted-foreground))]">· {meta().symbol}</span>
            </Show>
          </div>

          <AddressInput
            label={t("wallet.transfer.to")}
            value={to()}
            onChange={setTo}
            onUserSelect={(u) => setTo(u?.address || "")}
          />

          <AmountInput
            label={t("wallet.transfer.amount")}
            tokenAddress={props.tokenAddress || ""}
            balance={props.maxAmount}
            value={amountText()}
            onChange={({ text, amountWei: wei }) => { setAmountText(text); setAmountWei(wei); }}
          />

          <Show when={err()}>
            <div class="text-sm text-[hsl(var(--destructive))]">{err()}</div>
          </Show>

          <div class="pt-1 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={close}
              disabled={isProcessing()}
              class="px-3 py-1.5 rounded-md border border-[hsl(var(--border))] hover:bg-[hsl(var(--accent))] disabled:opacity-50"
            >
              {t("common.cancel")}
            </button>
            <button
              type="submit"
              disabled={isProcessing()}
              class="px-3 py-1.5 min-w-[120px] rounded-md bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90 disabled:opacity-60 flex items-center justify-center"
            >
              <Show when={isProcessing()} fallback={t("wallet.transfer.transferButton")}>
                <div class="flex items-center gap-2">
                  <Spinner class="w-4 h-4" />
                  <span>{t("wallet.transfer.sending")}</span>
                </div>
              </Show>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
