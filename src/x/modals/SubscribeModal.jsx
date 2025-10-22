// src/x/profile/SubscribeModal.jsx
import { createSignal, createResource, Show, createEffect } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";
import { getSavvaContract } from "../../blockchain/contracts.js";
import { getTokenInfo } from "../../blockchain/tokenMeta.jsx";
import { parseUnits } from "viem";
import { formatAmountWithDecimals } from "../../blockchain/tokenAmount.js";
import UserCard from "../ui/UserCard.jsx";
import AmountInput from "../ui/AmountInput.jsx";
import TokenValue from "../ui/TokenValue.jsx";
import Spinner from "../ui/Spinner.jsx";
import { sendAsActor } from "../../blockchain/npoMulticall.js";
import Modal from "../modals/Modal.jsx";

export default function SubscribeModal(props) {
  const app = useApp();
  const { t } = app;

  const authorAddr = () => String(props.author?.address || "");
  const domain = () => String(props.domain || "");
  const actorAddr = () => app.actorAddress?.() || app.authorizedUser?.()?.address || "";

  const [isBusy, setIsBusy] = createSignal(false);
  const [err, setErr] = createSignal("");

  const [amountText, setAmountText] = createSignal(""); // weekly amount (text)
  const [amountWei, setAmountWei] = createSignal(0n);   // weekly amount (wei)
  const [weeksText, setWeeksText] = createSignal("1");  // default 1 week

  // STAKING token (SAVVA_VOTES) meta for inputs + allowance
  const [stakingInfo] = createResource(
    () => app.desiredChain()?.id,
    async () => {
      const staking = await getSavvaContract(app, "Staking");
      const meta = await getTokenInfo(app, staking.address.toLowerCase());
      return { addr: staking.address, decimals: Number(meta?.decimals ?? 18) };
    }
  );
  const stakingAddr = () => stakingInfo()?.addr || "";
  const stakingDecimals = () => Number(stakingInfo()?.decimals ?? 18);

  // Current subscription + current frame (for ACTOR)
  const [subInfo] = createResource(
    () => ({
      domain: domain(),
      userAddr: actorAddr(),
      author: authorAddr(),
      chain: app.desiredChain()?.id,
    }),
    async ({ domain, userAddr, author }) => {
      const clubs = await getSavvaContract(app, "AuthorsClubs");
      const [sub, club] = await Promise.all([
        clubs.read.getSub([domain, userAddr, author]), // (amountPerWeek, lastFrame)
        clubs.read.getClub([domain, author]),          // (_, current_frame, _)
      ]);
      const amountPerWeek = Array.isArray(sub) ? (sub[0] ?? 0n) : (sub?.[0] ?? 0n);
      const lastFrame = Number(Array.isArray(sub) ? sub[1] : sub?.[1] ?? 0);
      const currentFrame = Number(Array.isArray(club) ? club[1] : club?.[1] ?? 0);
      return { amountPerWeek, lastFrame, currentFrame };
    }
  );

  // Initialize weekly amount from props or current sub
  let didInit = false;
  createEffect(() => {
    if (didInit) return;
    const s = subInfo();
    const dec = stakingDecimals();
    if (!s || !stakingAddr() || !Number.isFinite(dec)) return;

    // If initialWeeklyAmountWei is provided via props, use that
    if (props.initialWeeklyAmountWei && props.initialWeeklyAmountWei > 0n) {
      const txt = formatAmountWithDecimals(props.initialWeeklyAmountWei, dec, 6)
        .replace(/(\.\d*?[1-9])0+$/, "$1")
        .replace(/\.$/, "");
      setAmountText(txt);
      setAmountWei(props.initialWeeklyAmountWei);
    }
    // Otherwise, use existing subscription amount
    else if (s.amountPerWeek && s.amountPerWeek > 0n) {
      const txt = formatAmountWithDecimals(s.amountPerWeek, dec, 6)
        .replace(/(\.\d*?[1-9])0+$/, "$1")
        .replace(/\.$/, "");
      setAmountText(txt);
      setAmountWei(s.amountPerWeek);
    } else {
      setAmountText("");
      setAmountWei(0n);
    }
    didInit = true;
  });

  // Weeks parsing/validation
  const weeksNum = () => {
    const s = (weeksText() || "").trim();
    if (s === "") return NaN;
    const n = Number(s);
    return Number.isFinite(n) ? Math.trunc(n) : NaN;
  };
  const weeksTooBig = () => Number(weeksNum()) > 52;
  const weeksValid = () => !isNaN(weeksNum()) && weeksNum() >= 1 && weeksNum() <= 52;

  // Amount input parsing (staking token decimals)
  function normalizeAmount(txt) {
    return (txt ?? "").toString().trim().replace(/,/g, ".").replace(/[^\d.]/g, "");
  }
  function handleAmountChange(txt, weiMaybe) {
    setAmountText(txt);
    setErr("");
    if (typeof weiMaybe === "bigint") {
      setAmountWei(weiMaybe);
      return;
    }
    try {
      const norm = normalizeAmount(txt);
      if (!norm || norm === ".") { setAmountWei(0n); return; }
      setAmountWei(parseUnits(norm, isNaN(stakingDecimals()) ? 18 : stakingDecimals()));
    } catch {
      setAmountWei(0n);
    }
  }

  // Total price — only when weeks valid AND weekly amount > 0
  const totalWei = () => (weeksValid() && amountWei() > 0n ? amountWei() * BigInt(weeksNum()) : 0n);

  // Allowance on STAKING token to AuthorsClubs (actor-aware)
  const MAX_UINT = (1n << 256n) - 1n;
  async function ensureAllowance(needed) {
    const owner = actorAddr();
    if (!owner) throw new Error("WALLET_NOT_CONNECTED");
    const stakingRead = await getSavvaContract(app, "Staking");
    const clubs = await getSavvaContract(app, "AuthorsClubs");
    const allowance = await stakingRead.read.allowance([owner, clubs.address]);
    if (allowance >= needed) return;
    await sendAsActor(app, {
      contractName: "Staking",
      functionName: "approve",
      args: [clubs.address, MAX_UINT],
    });
  }

  function validate() {
    if (!authorAddr()) return t("subscriptions.errors.noAuthor");
    if (!actorAddr()) return t("subscriptions.errors.notAuthorized");
    if (amountWei() <= 0n) return t("wallet.transfer.errors.badAmount");
    if (!weeksValid()) return t("subscriptions.errors.badWeeks");
    return "";
  }

  async function submit(e) {
    e?.preventDefault?.();
    setErr("");
    const msg = validate();
    if (msg) { setErr(msg); return; }

    setIsBusy(true);
    try {
      const need = totalWei();
      if (need > 0n) await ensureAllowance(need);

      await sendAsActor(app, {
        contractName: "AuthorsClubs",
        functionName: "buy",
        args: [domain(), authorAddr(), amountWei(), BigInt(weeksNum())],
      });

      props.onSubmit?.();
      setIsBusy(false);
      props.onClose?.();
    } catch (e2) {
      console.error("Subscribe failed:", e2);
      setIsBusy(false);
      setErr(t("subscriptions.errors.txFailed"));
    }
  }

  const weeksLeft = () => {
    const s = subInfo();
    if (!s) return 0;
    return Math.max(0, Number(s.lastFrame) - Number(s.currentFrame));
  };

  return (
    <Modal
      isOpen={props.isOpen}
      onClose={props.onClose}
      title={t("subscriptions.subscribe.title")}
      size="md"
      footer={
        <div class="flex justify-end gap-2 pt-1">
          <button
            type="button"
            class="px-3 py-2 rounded border border-[hsl(var(--border))] hover:bg-[hsl(var(--accent))]"
            disabled={isBusy()}
            onClick={() => !isBusy() && props.onClose?.()}
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            onClick={() => submit()}
            disabled={isBusy() || !stakingAddr() || amountWei() <= 0n || !weeksValid()}
            class="px-3 py-2 rounded bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90 disabled:opacity-60"
          >
            <Show when={!isBusy()} fallback={<Spinner class="w-5 h-5" />}>
              {t("subscriptions.form.subscribeBtn")}
            </Show>
          </button>
        </div>
      }
    >
      <form onSubmit={submit} class="space-y-4">
        <p class="text-sm opacity-80">{t("subscriptions.info")}</p>

        {/* Author */}
        <div class="rounded-md border border-[hsl(var(--border))] p-2">
          <UserCard author={props.author} />
        </div>

        {/* Current subscription */}
        <Show when={!subInfo.loading} fallback={<div class="flex justify-center"><Spinner /></div>}>
          <Show when={subInfo()?.amountPerWeek > 0n}>
            <div class="rounded-md bg-[hsl(var(--secondary))] text-[hsl(var(--secondary-foreground))] p-3 space-y-1">
              <div class="font-medium">{t("subscriptions.current.title")}</div>
              <div class="text-sm flex items-center justify-between">
                <span>{t("subscriptions.current.amountPerWeek")}</span>
                <Show when={stakingAddr()}>
                  <TokenValue amount={subInfo()?.amountPerWeek || 0n} tokenAddress={stakingAddr()} />
                </Show>
              </div>
              <div class="text-sm">
                <Show when={weeksLeft() > 1} fallback={<span class="text-[hsl(var(--destructive))]">{t("subscriptions.current.expired")}</span>}>
                  <span>{t("subscriptions.current.weeksLeft", { n: weeksLeft() })}</span>
                </Show>
              </div>
            </div>
          </Show>
        </Show>

        {/* Form */}
        <div class="space-y-3">
          <AmountInput
            label={t("subscriptions.form.weeklyAmount")}
            tokenAddress={stakingAddr()}
            value={amountText()}
            onInput={handleAmountChange}
            onChange={(v) => handleAmountChange(v?.text ?? "", v?.amountWei)}
            placeholder={t("subscriptions.form.weeklyAmountPlaceholder")}
          />

          <div class="flex items-center gap-2">
            <label class="text-sm font-medium">{t("subscriptions.form.weeks")}</label>
            <input
              type="number"
              min="1"
              max="52"
              inputmode="numeric"
              value={weeksText()}
              onInput={(e) => setWeeksText(e.currentTarget.value)}
              class="w-24 px-2 py-1 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] text-[hsl(var(--foreground))] text-right"
            />
          </div>
          <Show when={weeksTooBig()}>
            <div class="text-xs text-[hsl(var(--destructive))]">
              {t("subscriptions.errors.badWeeks")}
            </div>
          </Show>

          {/* Total price – only when weeks valid AND weekly amount (wei) > 0 */}
          <Show when={weeksValid() && amountWei() > 0n && stakingAddr()}>
            <div class="flex items-center justify-between">
              <span class="text-sm opacity-80">{t("subscriptions.form.total")}</span>
              <TokenValue amount={totalWei()} tokenAddress={stakingAddr()} />
            </div>
          </Show>
        </div>

        <Show when={err()}>
          <div class="text-sm text-[hsl(var(--destructive))]">{err()}</div>
        </Show>
      </form>
    </Modal>
  );
}
