// src/components/editor/PostSubmissionWizard.jsx
import { createSignal, Show, For, Switch, Match } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";
import StepValidate from "./wizard_steps/StepValidate.jsx";

const STEPS = [
  { id: 'validate', title: "editor.publish.steps.validate", help: "editor.publish.steps.validate.help", component: StepValidate },
  { id: 'ipfs', title: "editor.publish.steps.ipfs", help: "editor.publish.steps.ipfs.help" },
  { id: 'ipfs_publish', title: "editor.publish.steps.ipfs_publish", help: "editor.publish.steps.ipfs_publish.help" },
  { id: 'register', title: "editor.publish.steps.register", help: "editor.publish.steps.register.help" },
  { id: 'publish', title: "editor.publish.steps.publish", help: "editor.publish.steps.publish.help" },
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
            <Show when={props.status === 'completed'}><CheckmarkIcon class="text-white" /></Show>
            <Show when={props.status === 'active'}><div class="w-4 h-4 rounded-full bg-blue-500" /></Show>
            <Show when={props.status === 'pending'}><div class="w-2 h-2 rounded-full bg-gray-400" /></Show>
        </div>
    );
}

export default function PostSubmissionWizard(props) {
  const { t } = useApp();
  const [currentStepIndex, setCurrentStepIndex] = createSignal(0);
  
  const handleNextStep = () => {
    if (currentStepIndex() < STEPS.length - 1) {
      setCurrentStepIndex(currentStepIndex() + 1);
    }
  };

  const getStepStatus = (index) => {
    if (index < currentStepIndex()) return 'completed';
    if (index === currentStepIndex()) return 'active';
    return 'pending';
  };

  const ActiveStepComponent = () => STEPS[currentStepIndex()].component;

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
                      <StepIcon status={getStepStatus(index())} class={getStepStatus(index()) === 'completed' ? 'bg-green-500 border-green-500' : 'border-gray-400'} />
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
                <Match when={ActiveStepComponent()}>
                  <ActiveStepComponent 
                    postData={props.postData}
                    postParams={props.postParams}
                    onComplete={handleNextStep}
                    onCancel={props.onClose}
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