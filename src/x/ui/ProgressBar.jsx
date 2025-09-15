// src/x/ui/ProgressBar.jsx
import { createMemo, Switch, Match } from "solid-js";

/**
 * Renders a progress bar with a percentage label.
 * Special handling for values over 100%: the bar becomes a proportional
 * representation of the amount that met the goal (green) and the extra (gold).
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
    <div class="flex items-center gap-2">
      <div
        class="flex-grow h-2 rounded-full bg-[hsl(var(--muted))] overflow-hidden flex border border-[hsl(var(--primary))]"
        role="progressbar"
        aria-valuenow={percentage()}
        aria-valuemin="0"
      >
        <Switch>
          <Match when={percentage() > 100}>
            <div
              class="h-full bg-green-600 rounded-l-full transition-[width] duration-300"
              style={{ width: `${greenPartWidth()}%` }}
            />
            <div
              class="h-full bg-amber-400 rounded-r-full transition-[width] duration-300"
              style={{ width: `${goldPartWidth()}%` }}
            />
          </Match>
          <Match when={percentage() <= 100}>
            <div
              class={`h-full rounded-full transition-[width] duration-300 ${
                percentage() >= 100 ? "bg-green-600" : "bg-[hsl(var(--primary))]"
              }`}
              style={{ width: `${percentage()}%` }}
            />
          </Match>
        </Switch>
      </div>
      <div class="text-xs w-14 text-right tabular-nums">
        {percentage().toFixed(1)}%
      </div>
    </div>
  );
}

