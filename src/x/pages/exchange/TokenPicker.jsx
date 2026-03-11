// src/x/pages/exchange/TokenPicker.jsx
import { createSignal, createResource, Show, For } from "solid-js";
import { Dynamic } from "solid-js/web";
import { useApp } from "../../../context/AppContext.jsx";
import { walletAccount } from "../../../blockchain/wallet.js";
import { createPublicClient, formatUnits } from "viem";
import { configuredHttp } from "../../../blockchain/contracts.js";

const ERC20_BALANCE_ABI = [
  { name: "balanceOf", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }], stateMutability: "view", type: "function" },
];

/**
 * TokenPicker — Uniswap-style token selector dropdown.
 * Props:
 * - tokens: array of { address }
 * - metas: array of { symbol, decimals, Icon } (parallel to tokens)
 * - selectedIdx: number
 * - disabledIdx: number (the "other" side's selected idx, shown greyed out)
 * - onSelect: (idx) => void
 */
export default function TokenPicker(props) {
  const app = useApp();
  const { t } = app;
  const [open, setOpen] = createSignal(false);

  // Fetch balances for all tokens when dropdown opens
  const [balances, { refetch }] = createResource(
    () => open() && walletAccount(),
    async (owner) => {
      if (!owner) return null;
      const chain = app.desiredChain();
      const pc = createPublicClient({ chain, transport: configuredHttp(chain.rpcUrls[0]) });
      const tokenList = props.tokens || [];
      const results = await Promise.allSettled(
        tokenList.map(async (tok) => {
          const addr = tok.address;
          if (!addr || addr === "0") {
            return await pc.getBalance({ address: owner });
          }
          return await pc.readContract({ address: addr, abi: ERC20_BALANCE_ABI, functionName: "balanceOf", args: [owner] });
        })
      );
      return results.map((r) => (r.status === "fulfilled" ? r.value : 0n));
    }
  );

  const selectedMeta = () => props.metas?.[props.selectedIdx];
  const selectedAddress = () => props.tokens?.[props.selectedIdx]?.address;

  const [copied, setCopied] = createSignal(false);
  const handleCopyAddress = (e) => {
    e.stopPropagation();
    const addr = selectedAddress();
    if (!addr || addr === "0") return;
    navigator.clipboard.writeText(addr).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  const handleSelect = (idx) => {
    props.onSelect(idx);
    setOpen(false);
  };

  const formatBalance = (bal, decimals) => {
    if (bal == null) return "";
    try {
      const dec = Number(decimals ?? 18);
      const num = parseFloat(formatUnits(BigInt(bal), dec));
      if (num === 0) return "0";
      if (num >= 1) return num.toLocaleString(undefined, { maximumFractionDigits: 4 });
      if (num >= 0.001) return num.toLocaleString(undefined, { maximumFractionDigits: 6 });
      return "<0.001";
    } catch {
      return "0";
    }
  };

  // Get USD price for a token
  const getUsdValue = (addr, bal, decimals) => {
    if (bal == null) return null;
    let price = null;
    if (!addr || addr === "0") {
      price = app.baseTokenPrice?.()?.price;
    } else {
      const lower = addr.toLowerCase();
      const savvaAddr = app.info()?.savva_contracts?.SavvaToken?.address?.toLowerCase();
      const stakingAddr = app.info()?.savva_contracts?.Staking?.address?.toLowerCase();
      if (lower === savvaAddr || lower === stakingAddr) price = app.savvaTokenPrice?.()?.price;
      else price = app.allTokenPrices?.()?.[lower]?.price;
    }
    if (!price) return null;
    try {
      const dec = Number(decimals ?? 18);
      const num = parseFloat(formatUnits(BigInt(bal), dec));
      const total = num * Number(price);
      if (total < 0.01) return null;
      return total.toLocaleString(undefined, { style: "currency", currency: "USD" });
    } catch {
      return null;
    }
  };

  return (
    <div class="relative">
      {/* Trigger button + copy */}
      <div class="flex items-center gap-1">
        <button
          type="button"
          onClick={() => { setOpen(!open()); if (!open()) refetch?.(); }}
          class="flex items-center gap-2 bg-[hsl(var(--muted))] hover:bg-[hsl(var(--accent))] text-[hsl(var(--foreground))] px-3 py-2 rounded-lg text-sm font-medium border border-[hsl(var(--border))] transition-colors"
        >
          <Show when={selectedMeta()?.Icon}>
            <Dynamic component={selectedMeta()?.Icon} class="w-5 h-5" />
          </Show>
          <span>{selectedMeta()?.symbol || "Select"}</span>
          <svg class="w-3 h-3 opacity-60" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M3 5l3 3 3-3" />
          </svg>
        </button>
        <button
          type="button"
          onClick={handleCopyAddress}
          disabled={!selectedAddress() || selectedAddress() === "0"}
          class="p-1.5 rounded text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors disabled:opacity-30 disabled:cursor-default disabled:hover:text-[hsl(var(--muted-foreground))]"
          title="Copy token address"
        >
          <Show when={!copied()} fallback={
            <svg class="w-3.5 h-3.5 text-green-500" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 9l3 3 7-7" />
            </svg>
          }>
            <svg class="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
              <rect x="5" y="5" width="8" height="8" rx="1" />
              <path d="M3 11V3a1 1 0 011-1h8" />
            </svg>
          </Show>
        </button>
      </div>

      {/* Dropdown */}
      <Show when={open()}>
        {/* Backdrop */}
        <div class="fixed inset-0 z-40" onClick={() => setOpen(false)} />

        <div class="absolute right-0 top-full mt-1 z-50 w-72 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-lg overflow-hidden">
          <div class="p-3 border-b border-[hsl(var(--border))]">
            <span class="text-sm font-medium">{t("exchange.swap.selectToken") || "Select a token"}</span>
          </div>

          <div class="max-h-64 overflow-y-auto">
            <For each={props.tokens || []}>
              {(tok, i) => {
                const idx = i();
                const meta = () => props.metas?.[idx];
                const isSelected = () => idx === props.selectedIdx;
                const isDisabled = () => idx === props.disabledIdx || (props.lockedToSavva && idx !== props.savvaIdx);
                const bal = () => balances()?.[idx];
                const usd = () => getUsdValue(tok.address, bal(), meta()?.decimals);

                return (
                  <button
                    type="button"
                    onClick={() => handleSelect(idx)}
                    disabled={isDisabled()}
                    class={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors ${
                      isSelected()
                        ? "bg-[hsl(var(--accent))]"
                        : isDisabled()
                          ? "opacity-40 cursor-not-allowed"
                          : "hover:bg-[hsl(var(--accent))]"
                    }`}
                  >
                    {/* Icon */}
                    <div class="w-8 h-8 rounded-full flex items-center justify-center bg-[hsl(var(--muted))] shrink-0">
                      <Show when={meta()?.Icon} fallback={<span class="text-xs">?</span>}>
                        <Dynamic component={meta()?.Icon} class="w-6 h-6" />
                      </Show>
                    </div>

                    {/* Name + Symbol */}
                    <div class="flex-1 min-w-0">
                      <div class="text-sm font-medium truncate">{meta()?.symbol || "..."}</div>
                    </div>

                    {/* Balance + USD */}
                    <Show when={walletAccount()}>
                      <div class="text-right shrink-0">
                        <Show when={bal() != null} fallback={<span class="text-xs text-[hsl(var(--muted-foreground))]">—</span>}>
                          <div class="text-sm tabular-nums">{formatBalance(bal(), meta()?.decimals)}</div>
                          <Show when={usd()}>
                            <div class="text-xs text-[hsl(var(--muted-foreground))] tabular-nums">{usd()}</div>
                          </Show>
                        </Show>
                      </div>
                    </Show>
                  </button>
                );
              }}
            </For>
          </div>
        </div>
      </Show>
    </div>
  );
}
