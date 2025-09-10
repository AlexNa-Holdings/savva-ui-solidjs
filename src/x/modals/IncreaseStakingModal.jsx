// src/x/profile/IncreaseStakingModal.jsx
import { createSignal, Show, createResource, createEffect } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";
import AmountInput from "../ui/AmountInput.jsx";
import { getSavvaContract } from "../../blockchain/contracts.js";
import Spinner from "../ui/Spinner.jsx";
import TokenValue from "../ui/TokenValue.jsx";
import { getTokenInfo } from "../../blockchain/tokenMeta.jsx";
import { parseUnits } from "viem";
import { sendAsActor } from "../../blockchain/npoMulticall.js";
import ModalAutoCloser from "../modals/ModalAutoCloser.jsx";
import ModalBackdrop from "../modals/ModalBackdrop.jsx";

const MAX_UINT = (1n << 256n) - 1n;

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

  const subjectAddr = () => app.actorAddress?.() || app.authorizedUser?.()?.address || "";

  const [amountText, setAmountText] = createSignal("");
  const [amountWei, setAmountWei] = createSignal(0n);
  const [err, setErr] = createSignal("");
  const [isProcessing, setIsProcessing] = createSignal(false);

  const [stakingInfo] = createResource(
    () => ({ app, userAddress: subjectAddr() }),
    fetchStakingInfo
  );

  const savvaAddr = () => String(props.savvaTokenAddress || "");
  const [savvaMeta] = createResource(
    () => ({ app, addr: savvaAddr() }),
    ({ app, addr }) => getTokenInfo(app, addr)
  );
  const tokenDecimals = () => Number(savvaMeta()?.decimals ?? 18);

  const myShare = () => {
    const info = stakingInfo();
    if (!info || info.error || !info.totalSupply || info.totalSupply === 0n) return "0.00";
    const myStake = info.myStake || 0n;
    const total = info.totalSupply;
    const percentage = (Number(myStake) / Number(total)) * 100;
    return percentage.toFixed(2);
  };

  function normalizeDecimalInput(text) {
    if (text == null) return "";
    let s = String(text).trim();
    s = s.replace(/,/g, ".").replace(/[^\d.]/g, "");
    if ((s.match(/\./g) || []).length > 1) throw new Error("invalid-decimal");
    if (s === "." || s === "") throw new Error("empty");
    return s;
  }

  createEffect(() => {
    const dec = tokenDecimals();
    const txt = amountText();
    if (!txt) return;
    try {
      const w = parseUnits(normalizeDecimalInput(txt), isNaN(dec) ? 18 : dec);
      setAmountWei(w);
      setErr("");
    } catch (e) {}
  });

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
      return;
    }
    try {
      const w = parseUnits(normalizeDecimalInput(txt), isNaN(dec) ? 18 : dec);
      setAmountWei(w);
      setErr("");
    } catch (eParse) {
      setAmountWei(0n);
    }
  };

  let amountWrapRef;

  const close = () => {
    if (isProcessing()) return;
    props.onClose?.();
  };

  function validate(v) {
    const val = typeof v === "bigint" ? v : amountWei();
    if (!val || val <= 0n) return t("wallet.transfer.errors.badAmount");
    if (props.savvaBalance != null && val > props.savvaBalance) return t("wallet.stake.errors.insufficientBalance");
    return "";
  }

  async function submit(e) {
    e.preventDefault();
    setErr("");
    let v = amountWei();
    if ((!v || v <= 0n)) {
      const inputEl = amountWrapRef?.querySelector("input");
      const liveTxt = inputEl?.value ?? amountText();
      try {
        const dec = tokenDecimals();
        v = parseUnits(normalizeDecimalInput(liveTxt), isNaN(dec) ? 18 : dec);
        setAmountWei(v);
        setAmountText(liveTxt);
      } catch (e2) {}
    }

    const msg = validate(v);
    if (msg) { setErr(msg); return; }

    setIsProcessing(true);
    let pendingToastId, approveToastId, stakeToastId;
    try {
      pendingToastId = pushToast({ type: "info", message: t("wallet.stake.toast.pending"), autohideMs: 0 });
      
      const staking = await getSavvaContract(app, "Staking");
      const token = await getSavvaContract(app, "SavvaToken");
      const owner = subjectAddr();
      const spender = staking.address;
      const current = await token.read.allowance([owner, spender]);

      if (current < v) {
        approveToastId = pushToast({ type: "info", message: t("wallet.stake.toast.approving"), autohideMs: 0 });
        await sendAsActor(app, {
          contractName: "SavvaToken",
          functionName: "approve",
          args: [spender, MAX_UINT],
        });
      }

      stakeToastId = pushToast({ type: "info", message: t("wallet.stake.toast.staking"), autohideMs: 0 });
      await sendAsActor(app, {
        contractName: "Staking",
        functionName: "stake",
        args: [v],
      });

      pushToast({ type: "success", message: t("wallet.stake.toast.success") });
      props.onSubmit?.();
      close();
    } catch (eTx) {
      log("Stake: tx failed", eTx?.message || eTx);
    } finally {
      if (pendingToastId) app.dismissToast?.(pendingToastId);
      if (approveToastId) app.dismissToast?.(approveToastId);
      if (stakeToastId) app.dismissToast?.(stakeToastId);
      setIsProcessing(false);
    }
  }

  return (
    <div class="fixed inset-0 z-50 flex items-center justify-center">
       <ModalBackdrop onClick={props.onClose} />
      <div class="relative w-full max-w-md rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[hsl(var(--card-foreground))] shadow-lg">
        <form onSubmit={submit} class="p-4 space-y-4">
          <ModalAutoCloser onClose={props.onClose} />
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