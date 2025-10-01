// src/x/modals/NftControlModal.jsx
import { Show } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";
import Modal from "./Modal.jsx";
import NftOwnerOptions from "../promote/NftOwnerOptions.jsx";

export default function NftControlModal(props) {
  const app = useApp();

  const handleActionComplete = (result) => {
    // Notify parent and close
    props.onActionComplete?.(result);
    props.onClose?.();
  };

  return (
    <Modal
      isOpen={props.isOpen}
      onClose={props.onClose}
      title={app.t("nft.control.title") || "Manage NFT"}
      size="2xl-fixed"
    >
      <Show when={props.tokenId}>
        <div class="p-6 bg-[hsl(var(--background))]">
          <NftOwnerOptions
            app={app}
            tokenId={props.tokenId}
            onActionComplete={handleActionComplete}
          />
        </div>
      </Show>
    </Modal>
  );
}
