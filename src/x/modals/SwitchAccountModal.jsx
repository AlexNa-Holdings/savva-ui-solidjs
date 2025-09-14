// src/x/auth/SwitchAccountModal.jsx
import { createEffect } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";
import { walletAccount } from "../../blockchain/wallet.js";
import Modal from "../modals/Modal.jsx";

function shortAddr(addr) {
  if (!addr) return "";
  return addr.slice(0, 6) + "…" + addr.slice(-4);
}

export default function SwitchAccountModal(props) {
  const { t } = useApp();
  const requiredAddress = () => props.requiredAddress?.toLowerCase();

  createEffect(() => {
    // Auto-resolve when the user switches to the required account
    if (props.isOpen && walletAccount()?.toLowerCase() === requiredAddress()) {
      props.onSuccess?.();
    }
  });

  return (
    <Modal
      isOpen={props.isOpen}
      onClose={props.onClose}
      title={t("auth.switchAccount.title")}
      size="sm"
      footer={
        <div class="flex gap-2 justify-end">
          <button
            class="px-3 py-2 rounded bg-[hsl(var(--secondary))] text-[hsl(var(--secondary-foreground))] hover:opacity-90"
            onClick={props.onCancel}
          >
            {t("common.cancel")}
          </button>
        </div>
      }
    >
      <p class="text-sm text-[hsl(var(--muted-foreground))]">
        {t("auth.switchAccount.message")}
        <br />
        <strong class="font-mono text-[hsl(var(--foreground))]">
          {shortAddr(props.requiredAddress)}
        </strong>
      </p>
    </Modal>
  );
}
