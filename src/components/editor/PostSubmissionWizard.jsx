// src/components/editor/PostSubmissionWizard.jsx
/*
  i18n technical comment. Do not remove.
  This is used by the i18n script to detect dynamically used keys.
  t("editor.publish.steps.validate")
  t("editor.publish.steps.validate.help")
  t("editor.publish.steps.check_rights")
  t("editor.publish.steps.check_rights.help")
  t("editor.publish.steps.ipfs")
  t("editor.publish.steps.ipfs.help")
  t("editor.publish.steps.ipfs_publish")
  t("editor.publish.steps.ipfs_publish.help")
  t("editor.publish.steps.publish")
  t("editor.publish.steps.publish.help")
*/
import { createSignal, createMemo, Show, For, Switch, Match } from "solid-js";
import { Dynamic } from "solid-js/web";
import { useApp } from "../../context/AppContext.jsx";
import StepValidate from "./wizard_steps/StepValidate.jsx";
import StepCheckRights from "./wizard_steps/StepCheckRights.jsx";
import StepUploadIPFS from "./wizard_steps/StepUploadIPFS.jsx";
import StepUploadDescriptor from "./wizard_steps/StepUploadDescriptor.jsx";
import StepPublish from "./wizard_steps/StepPublish.jsx";

const STEPS = [
  { id: "validate",      title: "editor.publish.steps.validate",      help: "editor.publish.steps.validate.help",      component: StepValidate },
  { id: "check_rights",  title: "editor.publish.steps.check_rights",  help: "editor.publish.steps.check_rights.help",  component: StepCheckRights },
  { id: "ipfs",          title: "editor.publish.steps.ipfs",          help: "editor.publish.steps.ipfs.help",          component: StepUploadIPFS },
  { id: "ipfs_publish",  title: "editor.publish.steps.ipfs_publish",  help: "editor.publish.steps.ipfs_publish.help",  component: StepUploadDescriptor },
  { id: "publish",       title: "editor.publish.steps.publish",       help: "editor.publish.steps.publish.help",       component: StepPublish },
];

function CheckmarkIcon(props) {
  return (
    <svg viewBox="0 0 24 24" class={props.class || "w-5 h-5"} fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="20 6 9 17 4 12"></polyline>
    </svg>
  );
}

function StepIcon(props) {
  return (
    <div class={`w-8 h-8 rounded-full flex items-center justify-center border-2 ${props.class}`}>
      <Show when={props.status === "completed"}><CheckmarkIcon class="text-white" /></Show>
      <Show when={props.status === "active"}><div class="w-4 h-4 rounded-full bg-blue-500" /></Show>
      <Show when={props.status === "pending"}><div class="w-2 h-2 rounded-full bg-gray-400" /></Show>
    </div>
  );
}

export default function PostSubmissionWizard(props) {
  const { t } = useApp();
  const [currentStepIndex, setCurrentStepIndex] = createSignal(0);
  const [publishedData, setPublishedData] = createSignal({});

  const activeComponent = createMemo(() => STEPS[currentStepIndex()]?.component);

  const handleNextStep = (stepResult) => {
    const currentStep = STEPS[currentStepIndex()];
    if (currentStep.id === 'ipfs') {
      setPublishedData(prev => ({ ...prev, ipfsCid: stepResult }));
    } else if (currentStep.id === 'ipfs_publish') {
      setPublishedData(prev => ({ ...prev, descriptorCid: stepResult }));
    }

    if (currentStepIndex() < STEPS.length - 1) {
      setCurrentStepIndex(currentStepIndex() + 1);
    } else {
      props.onSuccess?.();
    }
  };

  const getStepStatus = (index) => {
    if (index < currentStepIndex()) return "completed";
    if (index === currentStepIndex()) return "active";
    return "pending";
  };

  const handleValidationBack = () => {
    props.onClose?.();
  };

  return (
    <Show when={props.isOpen}>
      <div class="fixed inset-0 z-50 flex items-center justify-center">
        <div class="absolute inset-0 bg-black/40" />
        <div class="relative themed-dialog rounded-lg shadow-lg w-full max-w-3xl p-4 bg-[hsl(var(--card))] text-[hsl(var(--card-foreground))]">
          <header class="flex items-center justify-between pb-3 border-b border-[hsl(var(--border))]">
            <h3 class="text-lg font-semibold">{t("editor.publish.title")}</h3>
            <button class="px-3 py-1 rounded hover:bg-[hsl(var(--accent))]" onClick={props.onClose}>
              {t("common.cancel")}
            </button>
          </header>

          <div class="flex gap-6 py-4">
            <div class="w-48 flex-shrink-0">
              <For each={STEPS}>
                {(step, index) => (
                  <div class="flex items-start">
                    <div class="flex flex-col items-center mr-4">
                      <StepIcon status={getStepStatus(index())} class={getStepStatus(index()) === "completed" ? "bg-green-500 border-green-500" : "border-gray-400"} />
                      <Show when={index() < STEPS.length - 1}>
                        <div class="w-px h-8 bg-gray-300" />
                      </Show>
                    </div>
                    <div>
                      <h4 class="font-semibold text-sm">{t(step.title)}</h4>
                      <p class="text-xs text-[hsl(var(--muted-foreground))]">{t(step.help)}</p>
                    </div>
                  </div>
                )}
              </For>
            </div>

            <div class="flex-1 min-w-0 min-h-[20rem]">
              <Switch>
                <Match when={activeComponent()}>
                  <Dynamic
                    component={activeComponent()}
                    postData={props.postData}
                    postParams={props.postParams}
                    publishedData={publishedData}
                    onComplete={handleNextStep}
                    onCancel={handleValidationBack}
                    editorMode={props.editorMode}
                  />
                </Match>
              </Switch>
            </div>
          </div>
        </div>
      </div>
    </Show>
  );
}