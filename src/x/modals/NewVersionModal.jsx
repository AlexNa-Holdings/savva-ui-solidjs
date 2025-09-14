// src/x/modals/NewVersionModal.jsx
import Modal from "./Modal.jsx";
import { useApp } from "../../context/AppContext.jsx";

export default function NewVersionModal(props) {
  const { t } = useApp();

  const handleRefresh = () => {
    window.location.reload();
  };

  return (
    <Modal
      isOpen={props.isOpen}
      onClose={props.onClose}
      title={t("version.new.title")}
      size="sm"
      preventClose
      footer={
        <div class="flex justify-center">
          <button
            class="px-4 py-2 rounded bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90"
            onClick={handleRefresh}
          >
            {t("version.new.refresh")}
          </button>
        </div>
      }
    >
      <p class="text-sm text-[hsl(var(--muted-foreground))]">
        {t("version.new.message")}
      </p>
    </Modal>
  );
}
