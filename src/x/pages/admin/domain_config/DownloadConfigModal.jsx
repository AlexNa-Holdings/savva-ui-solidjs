// src/x/pages/admin/domain_config/DownloadConfigModal.jsx
import { useApp } from "../../../../context/AppContext.jsx";
import Modal from "../../../modals/Modal.jsx";

export default function DownloadConfigModal(props) {
  const { t } = useApp();

  return (
    <Modal
      isOpen={props.isOpen}
      onClose={props.onClose}
      title={t("admin.domainConfig.download.title")}
      size="md"
    >
      <div class="p-4 space-y-3">
        <p class="text-sm text-[hsl(var(--muted-foreground))]">
          {t("admin.domainConfig.download.description")}
        </p>
        <div class="flex flex-col gap-2">
          <button
            class="w-full px-4 py-2 rounded border border-[hsl(var(--input))] hover:bg-[hsl(var(--accent))]"
            onClick={() => props.onSelect('prod')}
          >
            {t("admin.domainConfig.download.actual")}
          </button>
          <button
            class="w-full px-4 py-2 rounded border border-[hsl(var(--input))] hover:bg-[hsl(var(--accent))]"
            onClick={() => props.onSelect('test')}
          >
            {t("admin.domainConfig.download.test")}
          </button>
          <button
            class="w-full px-4 py-2 rounded border border-[hsl(var(--input))] hover:bg-[hsl(var(--accent))]"
            onClick={() => props.onSelect('default')}
          >
            {t("admin.domainConfig.download.default")}
          </button>
        </div>
      </div>
    </Modal>
  );
}