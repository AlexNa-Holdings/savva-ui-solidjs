// src/x/governance/ProposalActions.jsx
import { Show, For } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";
import TokenValue from "../ui/TokenValue.jsx";

/**
 * Format a value based on its format type
 */
function FormattedValue(props) {
  const app = useApp();
  const { t } = app;

  const value = () => props.value;
  const format = () => props.format || "text";
  const tokenSymbol = () => props.tokenSymbol;

  return (
    <Show
      when={format() !== "text" && format() !== "hex"}
      fallback={
        <span class="font-mono text-sm break-all">
          {format() === "hex" && String(value()).length > 66
            ? `${String(value()).slice(0, 66)}...`
            : String(value())}
        </span>
      }
    >
      <Show when={format() === "address"}>
        <span class="font-mono text-sm">
          {value()?.slice(0, 6)}...{value()?.slice(-4)}
        </span>
      </Show>

      <Show when={format() === "token"}>
        <TokenValue amount={value()} symbol={tokenSymbol()} />
      </Show>

      <Show when={format() === "percent"}>
        <span class="font-semibold">{String(value())}%</span>
      </Show>

      <Show when={format() === "percent100"}>
        <span class="font-semibold">{Number(value()) / 100}%</span>
      </Show>

      <Show when={format() === "duration"}>
        <DurationValue value={value()} />
      </Show>

      <Show when={format() === "number"}>
        <span class="font-semibold">{String(value())}</span>
      </Show>
    </Show>
  );
}

/**
 * Format duration in seconds to human-readable format
 */
function DurationValue(props) {
  const formatDuration = (seconds) => {
    const sec = Number(seconds);
    if (sec < 60) return `${sec} second${sec !== 1 ? "s" : ""}`;
    if (sec < 3600) {
      const mins = Math.floor(sec / 60);
      return `${mins} minute${mins !== 1 ? "s" : ""}`;
    }
    if (sec < 86400) {
      const hours = Math.floor(sec / 3600);
      return `${hours} hour${hours !== 1 ? "s" : ""}`;
    }
    const days = Math.floor(sec / 86400);
    return `${days} day${days !== 1 ? "s" : ""}`;
  };

  return <span class="font-semibold">{formatDuration(props.value)}</span>;
}

/**
 * Display a single action detail row
 */
function ActionDetail(props) {
  const detail = () => props.detail;
  const isOldValue = () => detail().isOldValue || false;
  const isNewValue = () => detail().isNewValue || false;

  return (
    <div
      class={`flex items-start gap-2 py-1 ${
        isOldValue() ? "opacity-60" : ""
      }`}
    >
      <span class="text-xs text-muted-foreground min-w-[120px] shrink-0">
        {detail().label}:
      </span>
      <div class="flex-1 min-w-0">
        <div class={isNewValue() ? "font-semibold" : ""}>
          <FormattedValue
            value={detail().value}
            format={detail().format}
            tokenSymbol={detail().tokenSymbol}
          />
        </div>
      </div>
    </div>
  );
}

/**
 * Display a single parsed proposal action
 */
function ProposalActionCard(props) {
  const action = () => props.action;
  const display = () => action().display;

  return (
    <div
      class={`p-3 rounded-md border ${
        action().warning
          ? "border-yellow-500 bg-yellow-50 dark:bg-yellow-950/20"
          : "border-[hsl(var(--border))] bg-[hsl(var(--card))]"
      }`}
    >
      <h4 class="font-semibold text-sm mb-1">
        {display().title}
      </h4>
      <p class="text-xs text-muted-foreground mb-2">
        {display().subtitle}
      </p>
      <div class="space-y-1">
        <For each={display().details}>
          {(detail) => <ActionDetail detail={detail} />}
        </For>
      </div>
    </div>
  );
}

/**
 * Display all actions for a proposal
 */
export default function ProposalActions(props) {
  const app = useApp();
  const { t } = app;

  const parsedActions = () => props.parsedActions || [];

  return (
    <Show when={parsedActions().length > 0}>
      <div class="space-y-2">
        <h4 class="text-sm font-semibold text-muted-foreground">
          {t("governance.proposalActions")} ({parsedActions().length})
        </h4>
        <div class="space-y-2">
          <For each={parsedActions()}>
            {(action, index) => (
              <ProposalActionCard action={action} index={index()} />
            )}
          </For>
        </div>
      </div>
    </Show>
  );
}
