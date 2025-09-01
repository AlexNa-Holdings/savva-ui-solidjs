// src/components/ui/AmountInput.jsx
import { createMemo, createResource, createSignal, Show } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";
import { createPublicClient, http, formatUnits, parseUnits } from "viem";
import { walletAccount } from "../../blockchain/wallet.js";
import TokenValue from "./TokenValue.jsx";
import { getTokenInfo } from "../../blockchain/tokenMeta.js";

// Minimal ABI for ERC-20 balanceOf()
const ERC20_MIN_ABI = [
  { name: "balanceOf", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }], stateMutability: "view", type: "function" },
];

function isNonEmpty(addr) { return !!addr && /^0x[0-9a-fA-F]{40}$/.test(String(addr)); }

export default function AmountInput(props) {
  const app = useApp();
  const { t } = app;

  // ── chain / client ───────────────────────────────────────────────────────────
  const isBaseToken = createMemo(() => !isNonEmpty(props.tokenAddress));
  const chain = createMemo(() => app.desiredChain?.());
  const rpcUrl = createMemo(() => chain()?.rpcUrls?.[0]);
  const publicClient = createMemo(() => {
    const url = rpcUrl();
    return url ? createPublicClient({ chain: chain(), transport: http(url) }) : null;
  });

  // ── token meta (cached, SAVVA-aware; no JSX here) ────────────────────────────
  const tokenAddrForMeta = createMemo(() => (isBaseToken() ? "" : props.tokenAddress));
  const [tokenMeta] = createResource(
    () => ({ app, addr: tokenAddrForMeta() }),
    ({ app, addr }) => getTokenInfo(app, addr)
  );
  const decimals = createMemo(() => Number(tokenMeta()?.decimals ?? 18));
  const symbol = createMemo(() => String(tokenMeta()?.symbol || (isBaseToken() ? (chain()?.nativeCurrency?.symbol || "PLS") : "TOK")));

  // Owner address we use for balance lookups
  const ownerAddr = createMemo(() => {
    const connected = walletAccount();
    const authed = app.authorizedUser?.()?.address;
    return connected || authed || "0x0000000000000000000000000000000000000000";
  });

  // balance (ERC-20 or base). We show balance for both; MAX only for ERC-20.
  const [balanceRes, { refetch: refetchBal }] = createResource(
    () => ({ addr: props.tokenAddress, pc: publicClient(), provided: props.balance, base: isBaseToken(), owner: ownerAddr() }),
    async ({ addr, pc, provided, base, owner }) => {
      if (typeof provided === "bigint") return provided;
      if (!pc || !owner) return 0n;
      try {
        if (base) {
          // native coin balance
          return await pc.getBalance({ address: owner });
        } else {
          return await pc.readContract({ address: addr, abi: ERC20_MIN_ABI, functionName: "balanceOf", args: [owner] });
        }
      } catch { return 0n; }
    }
  );

  // ── input state ───────────────────────────────────────────────────────────────
  const [text, setText] = createSignal(String(props.value || ""));
  const [error, setError] = createSignal("");

  function toWeiSafe(s, dec) {
    try { return parseUnits(String(s).trim() || "0", dec); }
    catch { return null; }
  }
  function fromWeiSafe(v, dec) {
    try { return formatUnits(v || 0n, dec); }
    catch { return "0"; }
  }

  function emitChange(nextStr) {
    const dec = decimals() || 18;
    const wei = toWeiSafe(nextStr, dec);
    if (wei === null) {
      setError(t("common.invalidNumber"));
      props.onChange?.({ text: nextStr, amountWei: null, decimals: dec, symbol: symbol() });
    } else {
      setError("");
      props.onChange?.({ text: nextStr, amountWei: wei, decimals: dec, symbol: symbol() });
    }
  }

  function onInput(e) {
    const v = e.currentTarget.value;
    setText(v);
    emitChange(v);
  }

  async function useMax() {
    // Only for non-base tokens
    if (isBaseToken()) return;
    let bal = balanceRes();
    if (typeof bal !== "bigint") {
      try { bal = await refetchBal(); } catch { bal = 0n; }
    }
    const s = fromWeiSafe(bal || 0n, decimals() || 18);
    setText(s);
    emitChange(s);
  }

  // ── UI ────────────────────────────────────────────────────────────────────────
  return (
    <div class={props.class || ""}>
      <label class="block text-sm">
        <div class="mb-1 flex items-center justify-between">
          <span>{props.label || t("wallet.transfer.amount")}</span>
          <Show when={!isBaseToken() && (props.showMax ?? true)}>
            <button
              type="button"
              onClick={useMax}
              class="text-xs underline hover:opacity-80 disabled:opacity-50"
              disabled={balanceRes.loading}
            >
              {t("wallet.transfer.max")}
            </button>
          </Show>
        </div>

        <div class="flex items-stretch gap-2">
          <input
            value={text()}
            onInput={onInput}
            inputmode="decimal"
            placeholder={props.placeholder || "0.0"}
            class="flex-1 rounded-md border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3 py-2 outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
            autocomplete="off"
          />
          <div class="min-w-[64px] px-2 py-2 text-sm text-[hsl(var(--muted-foreground))] flex items-center justify-end">
            {symbol()}
          </div>
        </div>

        {/* Balance line (shown for BOTH base & ERC-20 if we can fetch/know it) */}
        <div class="mt-1 text-xs text-[hsl(var(--muted-foreground))] flex items-center gap-1">
          <span>{t("wallet.transfer.balance")}:</span>
          <Show when={typeof balanceRes() === "bigint"} fallback={<span>—</span>}>
            <TokenValue amount={balanceRes() || 0n} tokenAddress={isBaseToken() ? "0" : props.tokenAddress} />
          </Show>
        </div>

        <Show when={error()}>
          <div class="mt-1 text-sm text-[hsl(var(--destructive))]">{error()}</div>
        </Show>

        {/* Optional helper under the balance line, if caller provided one */}
        <Show when={props.helper}>
          <div class="mt-1 text-xs text-[hsl(var(--muted-foreground))]">{props.helper}</div>
        </Show>
      </label>
    </div>
  );
}
