// src/components/settings/PinningServicesSection.jsx
import { createSignal, For, Show } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";
import { getPinningServices, addPinningService, updatePinningService, deletePinningService, isPinningEnabled, setPinningEnabled } from "../../ipfs/pinning/storage.js";
import { testService } from "../../ipfs/pinning/manager.js";
import { pushToast } from "../../ui/toast.js";
import PinningServiceModal from "./PinningServiceModal.jsx";
import ConfirmModal from "../ui/ConfirmModal.jsx";
import Spinner from "../ui/Spinner.jsx";

const TestStepRow = (props) => {
  const { t } = useApp();
  const statusColor = () => {
    if (props.step.status === 'success') return 'text-emerald-500';
    if (props.step.status === 'error') return 'text-red-500';
    return 'text-[hsl(var(--muted-foreground))]';
  };
  const detailsText = () => {
    const { step, status, details } = props.step;
    if (typeof details === 'object' && details !== null) {
      if (status === 'pending' && details.url) {
        return t(`settings.pinning.test.details.${step}_pending`, details);
      }
      if (status === 'error' && details.url && details.error) {
        return t(`settings.pinning.test.details.${step}_error`, details);
      }
      return t(`settings.pinning.test.details.${step}_ok`, details);
    }
    return details || t(`settings.pinning.test.status.${props.step.status}`);
  };

  return (
    <div class="grid grid-cols-[2rem_1fr] items-start gap-2">
      <div class="flex justify-center pt-1">
        <Show when={props.step.status === 'pending'}><Spinner class="w-4 h-4" /></Show>
        <Show when={props.step.status === 'success'}><span class="text-emerald-500">✓</span></Show>
        <Show when={props.step.status === 'error'}><span class="text-red-500">✗</span></Show>
      </div>
      <div>
        <p class="font-semibold text-xs">{t(`settings.pinning.test.step.${props.step.step}`)}</p>
        <p class={`text-xs break-all ${statusColor()}`}>{detailsText()}</p>
      </div>
    </div>
  );
};

export default function PinningServicesSection() {
  const { t } = useApp();
  const [services, setServices] = createSignal(getPinningServices());
  const [usePinning, setUsePinning] = createSignal(isPinningEnabled());
  const [isModalOpen, setIsModalOpen] = createSignal(false);
  const [editingService, setEditingService] = createSignal(null);
  const [deletingService, setDeletingService] = createSignal(null);
  const [testingId, setTestingId] = createSignal(null);
  const [testDetails, setTestDetails] = createSignal(null);

  const refreshServices = () => setServices(getPinningServices());

  const handleTogglePinning = (e) => {
    const isEnabled = e.currentTarget.checked;
    setPinningEnabled(isEnabled);
    setUsePinning(isEnabled);
  };

  const handleAdd = () => {
    setEditingService(null);
    setIsModalOpen(true);
  };

  const handleEdit = (service) => {
    setEditingService(service);
    setIsModalOpen(true);
  };

  const handleSave = (service) => {
    if (service.id) {
      updatePinningService(service);
    } else {
      addPinningService(service);
    }
    refreshServices();
    setIsModalOpen(false);
  };

  const handleDelete = (service) => {
    deletePinningService(service.id);
    refreshServices();
  };

  const handleTest = async (service) => {
    setTestingId(service.id);
    setTestDetails({ serviceId: service.id, steps: [], error: null });

    const handleProgress = (progress) => {
      setTestDetails(prev => {
        const steps = [...prev.steps];
        const existingIndex = steps.findIndex(s => s.step === progress.step);
        if (existingIndex > -1) {
          steps[existingIndex] = progress;
        } else {
          steps.push(progress);
        }
        return { ...prev, steps };
      });
    };

    try {
      await testService(service, { onProgress: handleProgress });
      pushToast({ type: "success", message: t("settings.pinning.test.success") });
    } catch (e) {
      setTestDetails(prev => ({ ...prev, error: e.message }));
      pushToast({ type: "error", message: t("settings.pinning.test.error") });
    } finally {
      setTestingId(null);
    }
  };

  return (
    <>
      <section class="bg-[hsl(var(--card))] text-[hsl(var(--card-foreground))] rounded-lg shadow p-4 space-y-3">
        <div class="flex items-center justify-between">
          <h3 class="text-lg font-medium">{t("settings.pinning.title")}</h3>
          <button onClick={handleAdd} class="px-3 py-1.5 rounded-md border border-[hsl(var(--border))] text-sm hover:bg-[hsl(var(--accent))]">{t("settings.pinning.add")}</button>
        </div>
        <p class="text-sm text-[hsl(var(--muted-foreground))]">{t("settings.pinning.description")}</p>

        <div class="pt-2">
          <label class="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              class="rounded"
              checked={usePinning()}
              onChange={handleTogglePinning}
            />
            <span class="text-sm font-medium">{t("settings.pinning.enable.label")}</span>
          </label>
          <p class="text-xs text-[hsl(var(--muted-foreground))] mt-1 pl-6">{t("settings.pinning.enable.help")}</p>
        </div>

        <div class="space-y-2">
          <For each={services()}>
            {(service) => (
              <div class="p-2 rounded border border-[hsl(var(--border))]">
                <div class="flex items-center justify-between">
                  <div class="font-semibold text-sm">{service.name}</div>
                  <div class="flex items-center gap-2">
                    <button onClick={() => handleTest(service)} disabled={!!testingId()} class="px-2 py-1 text-xs rounded border border-[hsl(var(--input))] hover:bg-[hsl(var(--accent))] disabled:opacity-50">
                      {testingId() === service.id ? t("settings.pinning.testing") : t("settings.pinning.test")}
                    </button>
                    <button onClick={() => handleEdit(service)} class="px-2 py-1 text-xs">{t("settings.pinning.edit")}</button>
                    <button onClick={() => setDeletingService(service)} class="px-2 py-1 text-xs text-[hsl(var(--destructive))]">{t("settings.pinning.delete")}</button>
                  </div>
                </div>
                <Show when={testDetails()?.serviceId === service.id}>
                  <div class="mt-2 pt-2 border-t border-[hsl(var(--border))] space-y-2">
                    <For each={testDetails().steps}>
                      {(step) => <TestStepRow step={step} />}
                    </For>
                    <Show when={testDetails().error}>
                      <p class="text-xs text-red-500 font-semibold">{t("settings.pinning.test.errorDetails", { details: testDetails().error })}</p>
                    </Show>
                    <button onClick={() => setTestDetails(null)} class="text-xs hover:underline">{t("settings.pinning.test.hide_details")}</button>
                  </div>
                </Show>
              </div>
            )}
          </For>
        </div>
      </section>

      <PinningServiceModal
        isOpen={isModalOpen()}
        service={editingService()}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSave}
      />

      <ConfirmModal
        isOpen={!!deletingService()}
        onClose={() => setDeletingService(null)}
        onConfirm={() => {
          handleDelete(deletingService());
          setDeletingService(null);
        }}
        title={t("settings.pinning.confirmDelete.title")}
        message={t("settings.pinning.confirmDelete.message")}
      />
    </>
  );
}