// src/components/profile/IncreaseStakingModal.jsx
import { createSignal, Show, createResource, createMemo } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";
import AmountInput from "../ui/AmountInput.jsx";
import { getSavvaContract } from "../../blockchain/contracts.js";
import Spinner from "../ui/Spinner.jsx";
import TokenValue from "../ui/TokenValue.jsx";
import { performStake } from "../../blockchain/transactions.js"; 

async function fetchStakingInfo({ app, userAddress }) {
  if (!app || !userAddress) return null;
  try {
    const stakingContract = await getSavvaContract(app, "Staking");
    const [totalSupply, myStake] = await Promise.all([
      stakingContract.read.totalSupply(),
      stakingContract.read.balanceOf([userAddress])
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
  const user = () => app.authorizedUser();

  const [amountText, setAmountText] = createSignal("");
  const [amountWei, setAmountWei] = createSignal(null);
  const [err, setErr] = createSignal("");
  const [isProcessing, setIsProcessing] = createSignal(false);

  const [stakingInfo] = createResource(() => ({ app, userAddress: user()?.address }), fetchStakingInfo);

  const myShare = createMemo(() => {
    const info = stakingInfo();
    if (!info || info.error || !info.totalSupply || info.totalSupply === 0n) return "0.00";
    const myStake = info.myStake || 0n;
    const total = info.totalSupply;
    const percentage = (Number(myStake) / Number(total)) * 100;
    return percentage.toFixed(2);
  });

  const close = () => {
    if (isProcessing()) return;
    props.onClose?.();
  };

  function validate() {
    if (!amountWei() || amountWei() <= 0n) return t("wallet.transfer.errors.badAmount");
    if (amountWei() > props.savvaBalance) return t("wallet.stake.errors.insufficientBalance");
    return "";
  }
  
  async function submit(e) {
    e.preventDefault();
    const msg = validate();
    if (msg) { setErr(msg); return; }
    setErr("");
    setIsProcessing(true);
    
    try {
      await performStake(app, { amountWei: amountWei() });
      props.onSubmit?.();
      // ✅ important: clear processing BEFORE close() guard
      setIsProcessing(false);
      close();
    } catch (e) {
      // Error is handled by a toast within performStake.
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

          <AmountInput
            label={t("wallet.stake.amount")}
            tokenAddress={props.savvaTokenAddress}
            balance={props.savvaBalance}
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
