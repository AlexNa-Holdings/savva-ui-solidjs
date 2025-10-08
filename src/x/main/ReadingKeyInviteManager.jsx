// src/x/main/ReadingKeyInviteManager.jsx
import { createSignal, createEffect, Show } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";
import ReadingKeyInviteModal from "../modals/ReadingKeyInviteModal.jsx";
import { fetchReadingKey, generateReadingKey, publishReadingKey } from "../crypto/readingKey.js";
import { storeReadingKey } from "../crypto/readingKeyStorage.js";
import { pushToast, pushErrorToast } from "../../ui/toast.js";
import StoreReadingKeyModal from "../modals/StoreReadingKeyModal.jsx";

const DISMISSED_KEY = "savva_reading_key_invite_dismissed";

/**
 * Checks if the user has dismissed the reading key invite
 */
function isInviteDismissed() {
  try {
    return localStorage.getItem(DISMISSED_KEY) === "true";
  } catch {
    return false;
  }
}

/**
 * Component that manages the reading key invitation flow.
 * Shows a modal prompting users to generate their reading key after wallet connection.
 */
export default function ReadingKeyInviteManager() {
  const app = useApp();
  const { t } = app;

  const [showInviteModal, setShowInviteModal] = createSignal(false);
  const [showStoreKeyModal, setShowStoreKeyModal] = createSignal(false);
  const [pendingKeyToStore, setPendingKeyToStore] = createSignal(null);
  const [hasChecked, setHasChecked] = createSignal(false);

  // Check if we should show the invite when user connects
  createEffect(async () => {
    const user = app.authorizedUser();

    // Reset check flag when user changes
    if (!user) {
      setHasChecked(false);
      setShowInviteModal(false);
      return;
    }

    // Only check once per user session
    if (hasChecked()) return;
    setHasChecked(true);

    // Don't show if user dismissed it
    if (isInviteDismissed()) return;

    try {
      // Check if user already has a reading key
      const existingKey = await fetchReadingKey(app, user.address);

      // If they already have a key, don't show the invite
      if (existingKey) return;

      // Show the invite modal
      setShowInviteModal(true);
    } catch (error) {
      console.error("Error checking reading key:", error);
    }
  });

  const handleGenerate = async () => {
    const user = app.authorizedUser();
    if (!user?.address) return;

    try {
      // Generate the reading key
      const { nonce, publicKey, secretKey } = await generateReadingKey(user.address);

      // Publish to contract
      await publishReadingKey(app, publicKey, nonce);

      // Close invite modal
      setShowInviteModal(false);

      // Show success message
      pushToast({
        type: "success",
        message: t("readingKey.invite.success") || "Reading key generated successfully!"
      });

      // Prompt user to store the secret key
      setPendingKeyToStore({ nonce, publicKey, secretKey, address: user.address });
      setShowStoreKeyModal(true);
    } catch (err) {
      pushErrorToast(err, {
        context: t("readingKey.invite.error") || "Failed to generate reading key"
      });
    }
  };

  const handleConfirmStoreKey = () => {
    const pending = pendingKeyToStore();
    if (pending) {
      const success = storeReadingKey(pending.address, {
        nonce: pending.nonce,
        publicKey: pending.publicKey,
        secretKey: pending.secretKey,
      });

      if (success) {
        pushToast({
          type: "success",
          message: t("readingKey.store.stored") || "Reading key stored securely"
        });
      } else {
        pushToast({
          type: "error",
          message: t("readingKey.store.storeFailed") || "Failed to store reading key"
        });
      }
    }

    setShowStoreKeyModal(false);
    setPendingKeyToStore(null);
  };

  const handleDeclineStoreKey = () => {
    setShowStoreKeyModal(false);
    setPendingKeyToStore(null);
  };

  const handleClose = () => {
    setShowInviteModal(false);
  };

  return (
    <>
      <ReadingKeyInviteModal
        isOpen={showInviteModal()}
        onGenerate={handleGenerate}
        onClose={handleClose}
      />
      <StoreReadingKeyModal
        isOpen={showStoreKeyModal()}
        onClose={handleDeclineStoreKey}
        onConfirm={handleConfirmStoreKey}
      />
    </>
  );
}
