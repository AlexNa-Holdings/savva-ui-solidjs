// src/components/profile/UnstakeModal.jsx
import { Show, createSignal, createResource, createEffect } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";
import { createPublicClient, http, parseUnits } from "viem";
import { getSavvaContract } from "../../blockchain/contracts.js";
import { getTokenInfo } from "../../blockchain/tokenMeta.js";
import AmountInput from "../ui/AmountInput.jsx";
import Spinner from "../ui/Spinner.jsx";

export default function UnstakeModal(props) {
  const app = useApp();
  const { t } = app;
  const log = (...a) => (window?.dbg?.log ? window.dbg.log(...a) : console.debug(...a));

  const stakingAddress = () => app.info()?.savva_contracts?.Staking?.address || "";
  const userAddress = () => app.authorizedUser()?.address || "";

  const [amountText, setAmountText] = createSignal("");
  const [amountWei, setAmountWei] = createSignal(0n);
  const [err, setErr] = createSignal("");
  const [isProcessing, setIsProcessing] = createSignal(false);

  // tiny utils
  const normalizeDecimalInput = (text) => {
    if (text == null) return "";
    let s = String(text).trim();
    s = s.replace(/,/g, ".").replace(/[^\d.]/g, "");
    if ((s.match(/\./g) || []).length > 1) throw new Error("invalid-decimal");
    if (s === "." || s === "") throw new Error("empty");
    return s;
  };
  const parseWithDecimals = (text, decimals) => parseUnits(normalizeDecimalInput(text), Number.isFinite(decimals) ? Number(decimals) : 18);

  // staked (for validation)
  const [staked] = createResource(
    () => ({ user: userAddress(), chain: app.desiredChain() }),
    async ({ user }) => {
      if (!user) return 0n;
      const staking = await getSavvaContract(app, "Staking");
      const v = await staking.read.balanceOf([user]);
      log("Unstake: staked balance", v.toString());
      return v;
    }
  );

  // staking token decimals for exact parsing
  const [stakingMeta] = createResource(
    () => stakingAddress(),
    (addr) => addr ? getTokenInfo(app, addr.toLowerCase()) : null
  );
  const tokenDecimals = () => Number(stakingMeta()?.decimals ?? 18);

  // withdraw delay → days
  const [withdrawDays] = createResource(
    () => app.desiredChain(),
    async () => {
      try {
        const cfg = await getSavvaContract(app, "Config");
        let sec;
        if (cfg?.read?.staking_withdraw_delay)      sec = await cfg.read.staking_withdraw_delay([]);
        else if (cfg?.read?.stakingWithdrawDelay)   sec = await cfg.read.stakingWithdrawDelay([]);
        else if (cfg?.read?.get)                    sec = await cfg.read.get(["staking_withdraw_delay"]);
        const days = Math.ceil(Number(sec || 0) / 86400);
        log("Unstake: withdraw delay (days)", days);
        return days;
      } catch (e) {
        log("Unstake: withdraw delay read failed", e);
        return 0;
      }
    }
  );

  // re-parse once decimals are known
  createEffect(() => {
    const dec = tokenDecimals();
    const txt = amountText();
    if (!txt) return;
    try {
      const w = parseWithDecimals(txt, dec);
      setAmountWei(w);
      setErr("");
      log("Unstake: reparse after decimals", { txt, dec, wei: w.toString() });
    } catch (e) {
      log("Unstake: reparse failed", { txt, dec, err: e?.message });
    }
  });

  let inputWrapEl; // wrapper to read inner <input> if needed

  function close() {
    if (isProcessing()) return;
    props.onClose?.();
  }

  function validate(v) {
    const val = typeof v === "bigint" ? v : amountWei();
    const cur = staked() || 0n;
    log("Unstake: validate", { text: amountText(), wei: val?.toString?.(), cur: cur?.toString?.() });
    if (!val || val <= 0n) return t("wallet.transfer.errors.badAmount");
    if (val > cur) return t("wallet.stake.errors.insufficientBalance");
    return "";
  }

  async function submit(e) {
    e?.preventDefault?.();
    setErr("");

    let v = amountWei();
    // If our handlers didn't fire (text empty / wei zero), grab the live value from the inner <input>
    if ((!v || v <= 0n)) {
      const inputEl = inputWrapEl?.querySelector("input");
      const liveTxt = inputEl?.value ?? amountText();
      try {
        const w = parseWithDecimals(liveTxt, tokenDecimals());
        setAmountWei(w);
        setAmountText(liveTxt);
        v = w;
        log("Unstake: submit reparsed from DOM", { text: liveTxt, wei: w.toString() });
      } catch (e2) {
        log("Unstake: submit parse failed", { text: liveTxt, err: e2?.message });
      }
    }

    const msg = validate(v);
    if (msg) { setErr(msg); return; }

    setIsProcessing(true);
    try {
      const staking = await getSavvaContract(app, "Staking", { write: true });
      const hash = await staking.write.unstake([v]);
      log("Unstake: tx sent", { hash });
      const pc = createPublicClient({ chain: app.desiredChain(), transport: http(app.desiredChain().rpcUrls[0]) });
      await pc.waitForTransactionReceipt({ hash });
      log("Unstake: tx confirmed", { hash });
      props.onSubmit?.();
      setIsProcessing(false);
      close();
    } catch (eTx) {
      log("Unstake: tx error", eTx);
      setIsProcessing(false);
    }
  }

  // one handler used for multiple event names (component may emit different ones)
  const handleAmountChange = (txt, weiMaybe) => {
    const dec = tokenDecimals();
    setAmountText(txt);
    if (typeof weiMaybe === "bigint" && weiMaybe >= 0n) {
      setAmountWei(weiMaybe);
      setErr("");
      log("Unstake: change uses provided wei", { txt, wei: weiMaybe.toString() });
      return;
    }
    try {
      const w = parseWithDecimals(txt, dec);
      setAmountWei(w);
      setErr("");
      log("Unstake: change parsed", { txt, dec, wei: w.toString() });
    } catch (eParse) {
      setAmountWei(0n);
      log("Unstake: change parse pending/failed", { txt, dec, err: eParse?.message });
    }
  };

  return (
    <div class="fixed inset-0 z-50 flex items-center justify-center">
      <div class="absolute inset-0 bg-black/40" onClick={close} />
      <form
        onSubmit={submit}
        class="relative w-full max-w-md rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[hsl(var(--card-foreground))] shadow-lg p-4 space-y-4"
      >
        <h3 class="text-lg font-semibold">{t("wallet.unstake.title")}</h3>

        <p class="text-sm opacity-80">
          {t("wallet.unstake.notice", { days: withdrawDays() || 0 })}
        </p>

        <div ref={el => (inputWrapEl = el)} class="space-y-2">
          <AmountInput
            value={amountText()}
            tokenAddress={stakingAddress()}
            onInput={handleAmountChange}
            onChange={handleAmountChange}
            placeholder={t("wallet.unstake.amountPlaceholder")}
          />
          <div class="flex justify-end">
            <button
              type="button"
              class="text-xs underline opacity-80 hover:opacity-100"
              onClick={async () => {
                const max = staked() || 0n;
                setAmountWei(max);
                // best effort to reflect text: derive string with current decimals
                try {
                  const dec = tokenDecimals();
                  // quick format to text; minimal fraction trimming
                  const s = (Number(max) === 0 ? "0" : (max / 10n ** BigInt(dec))).toString(); // coarse; visual only
                  setAmountText(s);
                } catch { /* ignore */ }
                // also stuff value directly if we can reach the inner input
                const inputEl = inputWrapEl?.querySelector("input");
                if (inputEl) inputEl.value = amountText();
                log("Unstake: Max set", { wei: max.toString() });
              }}
            >
              {t("wallet.common.max")}
            </button>
          </div>
        </div>

        <Show when={err()}>
          <div class="text-sm text-[hsl(var(--destructive))]">{err()}</div>
        </Show>

        <div class="flex justify-end gap-2 pt-1">
          <button
            type="button"
            class="px-3 py-2 rounded border border-[hsl(var(--border))] hover:bg-[hsl(var(--accent))]"
            onClick={close}
          >
            {t("common.cancel")}
          </button>
          <button
            type="submit"
            disabled={isProcessing()}
            class="px-3 py-2 rounded bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90 disabled:opacity-60"
          >
            <Show when={!isProcessing()} fallback={<Spinner class="w-5 h-5" />}>
              {t("wallet.unstake.submit")}
            </Show>
          </button>
        </div>
      </form>
    </div>
  );
}
