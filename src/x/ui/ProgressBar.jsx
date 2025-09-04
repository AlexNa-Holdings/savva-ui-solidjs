// src/x/ui/ProgressBar.jsx
import { createMemo, Switch, Match } from "solid-js";

/**
 * Renders a progress bar with special handling for values over 100%.
 * If value > 100%, the bar becomes a proportional representation of
 * the amount that met the goal (green) and the extra amount (gold).
 * @param {object} props
 * @param {number} props.value - The percentage value (0 to ∞).
 */
export default function ProgressBar(props) {
  const percentage = createMemo(() => Number(props.value ?? 0));

  const greenPartWidth = createMemo(() => {
    const p = percentage();
    return p > 100 ? (100 / p) * 100 : 0;
  });

  const goldPartWidth = createMemo(() => {
    const p = percentage();
    return p > 100 ? ((p - 100) / p) * 100 : 0;
  });

  return (
    <div
      class="w-full h-2 rounded-full bg-[hsl(var(--muted))] overflow-hidden flex"
      role="progressbar"
      aria-valuenow={percentage()}
      aria-valuemin="0"
    >
      <Switch>
        <Match when={percentage() > 100}>
          {/* Green Part (Represents 100% Goal) */}
          <div
            class="h-full bg-green-600 rounded-l-full transition-[width] duration-300"
            style={{ width: `${greenPartWidth()}%` }}
          />
          {/* Gold Part (Represents Excess) */}
          <div
            class="h-full bg-amber-400 rounded-r-full transition-[width] duration-300"
            style={{ width: `${goldPartWidth()}%` }}
          />
        </Match>
        <Match when={percentage() <= 100}>
          {/* Standard Progress Bar */}
          <div
            class={`h-full rounded-full transition-[width] duration-300 ${
              percentage() >= 100 ? "bg-green-600" : "bg-[hsl(var(--primary))]"
            }`}
            style={{ width: `${percentage()}%` }}
          />
        </Match>
      </Switch>
    </div>
  );
}