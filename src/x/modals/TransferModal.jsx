// src/x/profile/TransferModal.jsx
import { createSignal, Show, createResource, createEffect } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";
import AddressInput from "../ui/AddressInput.jsx";
import AmountInput from "../ui/AmountInput.jsx";
import { getTokenInfo } from "../../blockchain/tokenMeta.jsx";
import { parseUnits } from "viem";
import Spinner from "../ui/Spinner.jsx";
import { sendAsActor } from "../../blockchain/npoMulticall.js";
import SavvaNPOAbi from "../../blockchain/abi/SavvaNPO.json";
import { createPublicClient, http } from "viem";
import Modal from "../modals/Modal.jsx";

function TokenTitleIcon({ app, tokenAddress, className = "w-5 h-5" }) {
  const addr = tokenAddress ? String(tokenAddress) : "";
  const [meta] = createResource(
    () => ({ app, addr }),
    ({ app, addr }) => getTokenInfo(app, addr)
  );
  const I = meta()?.Icon;
  return I ? <I class={className} /> : null;
}

// Minimal ERC20 transfer ABI
const ERC20_TRANSFER_ABI = [
  {
    name: "transfer",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ type: "address", name: "to" }, { type: "uint256", name: "amount" }],
    outputs: [{ type: "bool" }],
  },
];

export default function TransferModal(props) {
  const app = useApp();
  const { t } = app;
  const log = (...a) => (window?.dbg?.log ? window.dbg.log(...a) : console.debug(...a));

  const tokenAddr = () => (props.tokenAddress ? String(props.tokenAddress) : ""); // empty => native coin

  const [to, setTo] = createSignal(String(props.to || ""));
  const [amountText, setAmountText] = createSignal("");
  const [amountWei, setAmountWei] = createSignal(0n);
  const [err, setErr] = createSignal("");
  const [isProcessing, setIsProcessing] = createSignal(false);

  // Resolve token meta once (for decimals + icon + symbol)
  const [meta] = createResource(
    () => ({ app, addr: tokenAddr() }),
    ({ app, addr }) => getTokenInfo(app, addr)
  );
  const tokenDecimals = () => Number(meta()?.decimals ?? 18);

  // Re-parse current text once decimals arrive (hot reload / delayed meta)
  createEffect(() => {
    const dec = tokenDecimals();
    const txt = amountText();
    if (!txt) return;
    try {
      const w = parseUnits(normalizeDecimalInput(txt), isNaN(dec) ? 18 : dec);
      setAmountWei(w);
      setErr("");
      log("Transfer: reparse after decimals", { txt, dec, wei: w.toString() });
    } catch (e) {
      log("Transfer: reparse failed", { txt, dec, err: e?.message });
    }
  });

  // Normalizer & parser (decimal-safe, big-int exact)
  function normalizeDecimalInput(text) {
    if (text == null) return "";
    let s = String(text).trim();
    s = s.replace(/,/g, ".").replace(/[^\d.]/g, "");
    if ((s.match(/\./g) || []).length > 1) throw new Error("invalid-decimal");
    if (s === "." || s === "") throw new Error("empty");
    return s;
  }

  // Handle both event shapes from AmountInput: (txt, wei) OR ({ text, amountWei })
  const handleAmountChange = (a, b) => {
    const dec = tokenDecimals();
    let txt = "", weiMaybe = null;
    if (typeof a === "object" && a && "text" in a) {
      txt = String(a.text ?? "");
      weiMaybe = a.amountWei;
    } else {
      txt = String(a ?? "");
      weiMaybe = b;
    }

    setAmountText(txt);

    if (typeof weiMaybe === "bigint" && weiMaybe >= 0n) {
      setAmountWei(weiMaybe);
      setErr("");
      log("Transfer: change uses provided wei", { txt, wei: weiMaybe.toString() });
      return;
    }

    try {
      const w = parseUnits(normalizeDecimalInput(txt), isNaN(dec) ? 18 : dec);
      setAmountWei(w);
      setErr("");
      log("Transfer: change parsed", { txt, dec, wei: w.toString() });
    } catch (eParse) {
      setAmountWei(0n);
      log("Transfer: change parse pending/failed", { txt, dec, err: eParse?.message });
    }
  };

  // Fallback: read the inner <input> value on submit if needed
  let amountWrapRef;

  function validate(v) {
    const addr = String(to()).trim();
    const val = typeof v === "bigint" ? v : amountWei();

    const badAddr = !addr || !(addr.startsWith("0x") && addr.length === 42);
    if (badAddr) return t("wallet.transfer.errors.badAddress");

    log("Transfer: validate", { text: amountText(), wei: val?.toString?.() });
    if (!val || val <= 0n) return t("wallet.transfer.errors.badAmount");
    return "";
  }

  async function submit(e) {
    e?.preventDefault?.();
    setErr("");

    // Ensure we have wei even if handlers didn’t run
    let v = amountWei();
    if (!v || v <= 0n) {
      const inputEl = amountWrapRef?.querySelector("input");
      const liveTxt = inputEl?.value ?? amountText();
      try {
        const dec = tokenDecimals();
        v = parseUnits(normalizeDecimalInput(liveTxt), isNaN(dec) ? 18 : dec);
        setAmountWei(v);
        setAmountText(liveTxt);
        log("Transfer: submit reparsed from DOM", { text: liveTxt, wei: v.toString() });
      } catch (e2) {
        log("Transfer: submit parse failed", { text: liveTxt, err: e2?.message });
      }
    }

    const msg = validate(v);
    if (msg) { setErr(msg); return; }

    setIsProcessing(true);
    try {
      if (tokenAddr()) {
        // ERC-20 transfer via ACTOR (NPO => NPO.multicall; self => direct)
        await sendAsActor(app, {
          target: tokenAddr(),
          abi: ERC20_TRANSFER_ABI,
          functionName: "transfer",
          args: [to().trim(), v],
        });
      } else {
        // Native coin transfer:
        // - Self: direct sendTransaction
        // - NPO: call SavvaNPO.withdrawNative(to, amount)
        const isNpo = app.isActingAsNpo?.() === true;
        if (isNpo) {
          await sendAsActor(app, {
            target: app.actorAddress?.(),
            abi: SavvaNPOAbi,
            functionName: "withdrawNative",
            args: [to().trim(), v],
          });
        } else {
          const wc = await app.getGuardedWalletClient?.();
          if (!wc) throw new Error(t("tx.errorNoWallet"));
          const chain = app.desiredChain?.();
          const rpc =
            chain?.rpcUrls?.[0] ||
            chain?.rpcUrls?.default?.http?.[0] ||
            chain?.rpcUrls?.public?.http?.[0];
          const pc = createPublicClient({ chain, transport: http(rpc) });
          const hash = await wc.sendTransaction({ to: to().trim(), value: v });
          await pc.waitForTransactionReceipt({ hash });
        }
      }

      props.onSubmit?.({ to: to().trim(), amountWei: v, tokenAddress: tokenAddr() });
      setIsProcessing(false);
      if (!isProcessing()) props.onClose?.();
    } catch (eTx) {
      setIsProcessing(false);
      log("Transfer: tx failed", eTx?.message || eTx);
    }
  }

  const header = (
    <div class="text-lg font-semibold flex items-center gap-2">
      <TokenTitleIcon app={app} tokenAddress={tokenAddr()} />
      <span>
        {t("wallet.transfer.titleToken", {
          token: meta()?.symbol || (tokenAddr() ? t("wallet.erc20") : t("wallet.nativeToken")),
        })}
      </span>
    </div>
  );

  return (
    <Modal
      isOpen={props.isOpen}
      onClose={() => !isProcessing() && props.onClose?.()}
      header={header}
      size="md"
      footer={
        <div class="pt-1 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => !isProcessing() && props.onClose?.()}
            disabled={isProcessing()}
            class="px-3 py-1.5 rounded-md border border-[hsl(var(--border))] hover:bg-[hsl(var(--accent))] disabled:opacity-50"
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            onClick={() => submit()}
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
      }
    >
      <form onSubmit={submit} class="space-y-4">
        <AddressInput
          label={t("wallet.transfer.to")}
          value={to()}
          onChange={setTo}
          onUserSelect={(u) => setTo(u?.address || "")}
        />

        <div ref={(el) => (amountWrapRef = el)}>
          <AmountInput
            label={t("wallet.transfer.amount")}
            tokenAddress={tokenAddr()}
            balance={props.maxAmount}
            value={amountText()}
            onInput={handleAmountChange}
            onChange={handleAmountChange}
          />
        </div>

        <Show when={err()}>
          <div class="text-sm text-[hsl(var(--destructive))]">{err()}</div>
        </Show>
      </form>
    </Modal>
  );
}
