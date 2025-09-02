// src/components/profile/IncreaseStakingModal.jsx
import { createSignal, Show, createResource, createMemo, createEffect } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";
import AmountInput from "../ui/AmountInput.jsx";
import { getSavvaContract } from "../../blockchain/contracts.js";
import Spinner from "../ui/Spinner.jsx";
import TokenValue from "../ui/TokenValue.jsx";
import { performStake } from "../../blockchain/transactions.js";
import { getTokenInfo } from "../../blockchain/tokenMeta.js";
import { parseUnits } from "viem";

async function fetchStakingInfo({ app, userAddress }) {
  if (!app || !userAddress) return null;
  try {
    const stakingContract = await getSavvaContract(app, "Staking");
    const [totalSupply, myStake] = await Promise.all([
      stakingContract.read.totalSupply(),
      stakingContract.read.balanceOf([userAddress]),
    ]);
    return { totalSupply, myStake };
  } catch (e) {
    console.error("Failed to fetch staking info", e);
    return { error: e };
  }
}

export default function IncreaseStakingModal(props) {
  const app = useApp();
  const { t } = app;
  const log = (...a) => (window?.dbg?.log ? window.dbg.log(...a) : console.debug(...a));
  const user = () => app.authorizedUser();

  const [amountText, setAmountText] = createSignal("");
  const [amountWei, setAmountWei] = createSignal(0n);
  const [err, setErr] = createSignal("");
  const [isProcessing, setIsProcessing] = createSignal(false);

  const [stakingInfo] = createResource(
    () => ({ app, userAddress: user()?.address }),
    fetchStakingInfo
  );

  // Resolve SAVVA token meta for decimals (we’re staking SAVVA)
  const savvaAddr = () => String(props.savvaTokenAddress || "");
  const [savvaMeta] = createResource(
    () => ({ app, addr: savvaAddr() }),
    ({ app, addr }) => getTokenInfo(app, addr)
  );
  const tokenDecimals = () => Number(savvaMeta()?.decimals ?? 18);

  const myShare = createMemo(() => {
    const info = stakingInfo();
    if (!info || info.error || !info.totalSupply || info.totalSupply === 0n) return "0.00";
    const myStake = info.myStake || 0n;
    const total = info.totalSupply;
    const percentage = (Number(myStake) / Number(total)) * 100;
    return percentage.toFixed(2);
  });

  // Normalize and parse helpers
  function normalizeDecimalInput(text) {
    if (text == null) return "";
    let s = String(text).trim();
    s = s.replace(/,/g, ".").replace(/[^\d.]/g, "");
    if ((s.match(/\./g) || []).length > 1) throw new Error("invalid-decimal");
    if (s === "." || s === "") throw new Error("empty");
    return s;
  }

  // Re-parse current text once decimals arrive
  createEffect(() => {
    const dec = tokenDecimals();
    const txt = amountText();
    if (!txt) return;
    try {
      const w = parseUnits(normalizeDecimalInput(txt), isNaN(dec) ? 18 : dec);
      setAmountWei(w);
      setErr("");
      log("Stake: reparse after decimals", { txt, dec, wei: w.toString() });
    } catch (e) {
      log("Stake: reparse failed", { txt, dec, err: e?.message });
    }
  });

  // Accept both AmountInput event shapes
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
      log("Stake: change uses provided wei", { txt, wei: weiMaybe.toString() });
      return;
    }

    try {
      const w = parseUnits(normalizeDecimalInput(txt), isNaN(dec) ? 18 : dec);
      setAmountWei(w);
      setErr("");
      log("Stake: change parsed", { txt, dec, wei: w.toString() });
    } catch (eParse) {
      setAmountWei(0n);
      log("Stake: change parse pending/failed", { txt, dec, err: eParse?.message });
    }
  };

  // Fallback: read inner <input> if our handlers didn’t fire
  let amountWrapRef;

  const close = () => {
    if (isProcessing()) return;
    props.onClose?.();
  };

  function validate(v) {
    const val = typeof v === "bigint" ? v : amountWei();
    log("Stake: validate", { text: amountText(), wei: val?.toString?.(), max: props.savvaBalance?.toString?.() });
    if (!val || val <= 0n) return t("wallet.transfer.errors.badAmount");
    if (props.savvaBalance != null && val > props.savvaBalance) return t("wallet.stake.errors.insufficientBalance");
    return "";
  }

  async function submit(e) {
    e.preventDefault();
    setErr("");

    // Ensure wei even if handlers didn't run
    let v = amountWei();
    if ((!v || v <= 0n)) {
      const inputEl = amountWrapRef?.querySelector("input");
      const liveTxt = inputEl?.value ?? amountText();
      try {
        const dec = tokenDecimals();
        v = parseUnits(normalizeDecimalInput(liveTxt), isNaN(dec) ? 18 : dec);
        setAmountWei(v);
        setAmountText(liveTxt);
        log("Stake: submit reparsed from DOM", { text: liveTxt, wei: v.toString() });
      } catch (e2) {
        log("Stake: submit parse failed", { text: liveTxt, err: e2?.message });
      }
    }

    const msg = validate(v);
    if (msg) { setErr(msg); return; }

    setIsProcessing(true);
    try {
      await performStake(app, { amountWei: v });
      props.onSubmit?.();
      setIsProcessing(false);
      close();
    } catch (eTx) {
      setIsProcessing(false);
    }
  }

  return (
    <div class="fixed inset-0 z-50 flex items-center justify-center">
      <div class="absolute inset-0 bg-black/40" onClick={close} />
      <div class="relative w-full max-w-md rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[hsl(var(--card-foreground))] shadow-lg">
        <form onSubmit={submit} class="p-4 space-y-4">
          <h3 class="text-lg font-semibold">{t("wallet.stake.title")}</h3>

          <Show when={!stakingInfo.loading && stakingInfo() && !stakingInfo().error} fallback={<div class="flex justify-center"><Spinner /></div>}>
            <div class="text-sm space-y-1 text-[hsl(var(--muted-foreground))]">
              <div class="flex justify-between">
                <span>{t("wallet.stake.totalStaked")}:</span>
                <TokenValue amount={stakingInfo().totalSupply} tokenAddress={props.savvaTokenAddress} />
              </div>
              <div class="flex justify-between">
                <span>{t("wallet.stake.myStake")}:</span>
                <div class="flex items-center gap-2">
                  <TokenValue amount={stakingInfo().myStake} tokenAddress={props.savvaTokenAddress} />
                  <span>({myShare()}%)</span>
                </div>
              </div>
            </div>
          </Show>

          <div ref={el => (amountWrapRef = el)}>
            <AmountInput
              label={t("wallet.stake.amount")}
              tokenAddress={props.savvaTokenAddress}
              balance={props.savvaBalance}
              value={amountText()}
              onInput={handleAmountChange}
              onChange={handleAmountChange}
            />
          </div>

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
              disabled={isProcessing() || !amountWei() || amountWei() <= 0n}
              class="px-3 py-1.5 min-w-[120px] rounded-md bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90 disabled:opacity-60 flex items-center justify-center"
            >
              <Show when={isProcessing()} fallback={t("wallet.stake.stakeButton")}>
                <div class="flex items-center gap-2">
                  <Spinner class="w-4 h-4" />
                  <span>{t("wallet.stake.staking")}</span>
                </div>
              </Show>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
