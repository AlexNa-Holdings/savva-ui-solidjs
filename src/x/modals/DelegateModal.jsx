// src/x/modals/DelegateModal.jsx
import { Show, createSignal } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";
import { getSavvaContract } from "../../blockchain/contracts.js";
import { isAddress } from "viem";
import { pushToast, pushErrorToast } from "../../ui/toast.js";
import AddressInput from "../ui/AddressInput.jsx";
import Modal from "./Modal.jsx";

export default function DelegateModal(props) {
  const app = useApp();
  const { t } = app;

  const [delegateAddress, setDelegateAddress] = createSignal("");
  const [isSubmitting, setIsSubmitting] = createSignal(false);
  const [error, setError] = createSignal("");

  /**
   * Delegate to self
   */
  const handleDelegateToSelf = async () => {
    const actorAddr = app.actorAddress?.();
    if (!actorAddr) return;

    setIsSubmitting(true);
    setError("");

    try {
      const staking = await getSavvaContract(app, "Staking", { write: true });

      const toastId = pushToast({
        type: "info",
        message: t("governance.delegation.pending"),
        autohideMs: 0,
      });

      try {
        // Call delegate function with actor address
        const hash = await staking.write.delegate([actorAddr]);

        // Wait for transaction
        const publicClient = app.publicClient?.();
        if (publicClient) {
          await publicClient.waitForTransactionReceipt({ hash });
        }

        pushToast({
          type: "success",
          message: t("governance.delegation.success"),
        });

        props.onSuccess?.();
      } finally {
        app.dismissToast?.(toastId);
      }
    } catch (err) {
      console.error("Failed to delegate to self:", err);
      pushErrorToast(err, { message: t("governance.delegation.error") });
    } finally {
      setIsSubmitting(false);
    }
  };

  /**
   * Delegate to another address
   */
  const handleDelegateToAddress = async () => {
    const address = delegateAddress().trim();

    // Validate address
    if (!address) {
      setError(t("governance.delegation.enterAddress"));
      return;
    }

    if (!isAddress(address)) {
      setError(t("governance.delegation.invalidAddress"));
      return;
    }

    setIsSubmitting(true);
    setError("");

    try {
      const staking = await getSavvaContract(app, "Staking", { write: true });

      const toastId = pushToast({
        type: "info",
        message: t("governance.delegation.pending"),
        autohideMs: 0,
      });

      try {
        // Call delegate function with specified address
        const hash = await staking.write.delegate([address]);

        // Wait for transaction
        const publicClient = app.publicClient?.();
        if (publicClient) {
          await publicClient.waitForTransactionReceipt({ hash });
        }

        pushToast({
          type: "success",
          message: t("governance.delegation.success"),
        });

        props.onSuccess?.();
      } finally {
        app.dismissToast?.(toastId);
      }
    } catch (err) {
      console.error("Failed to delegate to address:", err);
      pushErrorToast(err, { message: t("governance.delegation.error") });
    } finally {
      setIsSubmitting(false);
    }
  };

  /**
   * Handle address input change
   */
  const handleAddressChange = (addr) => {
    setDelegateAddress(addr);
    setError("");
  };

  return (
    <Modal
      isOpen={props.isOpen}
      onClose={props.onClose}
      title={t("governance.delegation.title")}
      hint={t("governance.delegation.description")}
      size="md"
      footer={
        <div class="flex justify-end">
          <button
            class="px-4 py-2 rounded-md border border-[hsl(var(--border))] hover:bg-[hsl(var(--accent))]"
            onClick={() => props.onClose?.()}
            disabled={isSubmitting()}
          >
            {t("common.cancel")}
          </button>
        </div>
      }
    >
      {/* Delegate to Self Section */}
      <div class="mb-6 p-4 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted))]">
        <h3 class="font-semibold mb-2">{t("governance.delegation.toSelf")}</h3>
        <p class="text-sm text-muted-foreground mb-3">
          {t("governance.delegation.toSelfDescription")}
        </p>
        <button
          class="w-full px-4 py-2 rounded-md bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:bg-[hsl(var(--primary))]/90 disabled:opacity-50"
          onClick={handleDelegateToSelf}
          disabled={isSubmitting()}
        >
          {isSubmitting() ? t("governance.delegation.submitting") : t("governance.delegation.delegateToSelf")}
        </button>
      </div>

      {/* Delegate to Another Address */}
      <div class="mb-6">
        <h3 class="font-semibold mb-2">{t("governance.delegation.toOther")}</h3>
        <p class="text-sm text-muted-foreground mb-3">
          {t("governance.delegation.toOtherDescription")}
        </p>

        <AddressInput
          value={delegateAddress()}
          onChange={handleAddressChange}
          placeholder={t("governance.delegation.addressPlaceholder")}
          label=""
          class="mb-2"
        />

        <Show when={error()}>
          <p class="text-sm text-red-500 mb-2">{error()}</p>
        </Show>

        <button
          class="w-full px-4 py-2 rounded-md border border-[hsl(var(--border))] hover:bg-[hsl(var(--accent))] disabled:opacity-50"
          onClick={handleDelegateToAddress}
          disabled={isSubmitting()}
        >
          {isSubmitting() ? t("governance.delegation.submitting") : t("governance.delegation.delegateToAddress")}
        </button>
      </div>

    </Modal>
  );
}
