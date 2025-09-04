// src/x/auth/SwitchAccountModal.jsx
import { Show, createEffect } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";
import { walletAccount } from "../../blockchain/wallet.js";

function shortAddr(addr) {
  if (!addr) return "";
  return addr.slice(0, 6) + "…" + addr.slice(-4);
}

export default function SwitchAccountModal(props) {
  const { t } = useApp();
  const requiredAddress = () => props.requiredAddress?.toLowerCase();

  createEffect(() => {
    // Automatically close and resolve when the user switches to the correct account.
    if (props.isOpen && walletAccount()?.toLowerCase() === requiredAddress()) {
      props.onSuccess?.();
    }
  });

  return (
    <Show when={props.isOpen}>
      <div class="fixed inset-0 z-[60] flex items-center justify-center">
        <div class="absolute inset-0 bg-black/40" />
        <div class="relative themed-dialog rounded-lg shadow-lg w-full max-w-md p-4 bg-[hsl(var(--card))] text-[hsl(var(--card-foreground))]">
          <h3 class="text-lg font-semibold mb-2">Wrong Account Selected</h3>
          <p class="text-sm text-[hsl(var(--muted-foreground))] mb-4">
            To continue, please open your wallet and switch to the following account:
            <br />
            <strong class="font-mono text-[hsl(var(--foreground))]">{shortAddr(props.requiredAddress)}</strong>
          </p>
          <div class="flex gap-2 justify-end">
            <button
              class="px-3 py-2 rounded bg-[hsl(var(--secondary))] text-[hsl(var(--secondary-foreground))] hover:opacity-90"
              onClick={props.onCancel}
            >
              {t("common.cancel")}
            </button>
          </div>
        </div>
      </div>
    </Show>
  );
}