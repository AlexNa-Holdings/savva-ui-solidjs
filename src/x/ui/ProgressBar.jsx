// src/x/ui/ProgressBar.jsx
import { createMemo, Switch, Match } from "solid-js";

/**
 * @param {object} props
 * @param {number} props.value - Percentage value (0..∞).
 * @param {"normal"|"reversed"} [props.colors] - Track/fill palette.
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

  // Palette
  const palette = createMemo(() => {
    const reversed = String(props.colors || "normal") === "reversed";
    return reversed
      ? {
          track: "bg-[hsl(var(--primary))]",
          trackBorder: "border-[hsl(var(--card))]/30",
          fillBase: "bg-[hsl(var(--card))]",
        }
      : {
          track: "bg-[hsl(var(--muted))]",
          trackBorder: "border-[hsl(var(--primary))]/40",
          fillBase: "bg-[hsl(var(--primary))]",
        };
  });

  return (
    <div class="flex items-center gap-2">
      <div
        class={`flex-grow h-4 rounded-full overflow-hidden flex border ${palette().track} ${palette().trackBorder}`}
        role="progressbar"
        aria-valuenow={percentage()}
        aria-valuemin="0"
      >
        <Switch>
          <Match when={percentage() > 100}>
            {/* Portion that reached the goal */}
            <div
              class="h-full bg-green-600 rounded-l-full transition-[width] duration-300"
              style={{ width: `${greenPartWidth()}%` }}
            />
            {/* Overflow beyond 100% */}
            <div
              class="h-full bg-amber-400 rounded-r-full transition-[width] duration-300"
              style={{ width: `${goldPartWidth()}%` }}
            />
          </Match>
          <Match when={percentage() <= 100}>
            <div
              class={`h-full rounded-full transition-[width] duration-300 ${
                percentage() >= 100 ? "bg-green-600" : palette().fillBase
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
