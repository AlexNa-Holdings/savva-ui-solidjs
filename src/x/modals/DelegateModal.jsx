// src/x/modals/DelegateModal.jsx
import { Show, createSignal } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";
import { isAddress } from "viem";
import { sendAsActor } from "../../blockchain/npoMulticall.js";
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
      await sendAsActor(app, {
        contractName: "Staking",
        functionName: "delegate",
        args: [actorAddr],
      });

      props.onSuccess?.();
    } catch (err) {
      console.error("Failed to delegate to self:", err);
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
      await sendAsActor(app, {
        contractName: "Staking",
        functionName: "delegate",
        args: [address],
      });

      props.onSuccess?.();
    } catch (err) {
      console.error("Failed to delegate to address:", err);
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
          <div class="mb-2 p-3 rounded-md bg-yellow-100 dark:bg-yellow-900/20 border border-yellow-300 dark:border-yellow-700">
            <p class="text-sm text-yellow-800 dark:text-yellow-400 font-medium">{error()}</p>
          </div>
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
