// src/x/ui/ProgressBar.jsx
import { createMemo, Switch, Match, Show } from "solid-js";

/**
 * @param {object} props
 * @param {number} props.value - Percentage value (0..100).
 * @param {number} [props.target] - Target percentage (default: 100). When value >= target, bar turns green.
 * @param {"normal"|"reversed"} [props.colors] - Track/fill palette.
 */
export default function ProgressBar(props) {
  const percentage = createMemo(() => Number(props.value ?? 0));
  const target = createMemo(() => Number(props.target ?? 100));

  const filledPortion = createMemo(() => {
    const p = percentage();
    if (!Number.isFinite(p)) return 0;
    return Math.max(0, Math.min(p, 100));
  });

  const targetReached = createMemo(() => percentage() >= target());

  const showTargetMarker = createMemo(() => {
    const t = target();
    return t > 0 && t < 100;
  });

  const formatTargetPercent = createMemo(() => {
    const t = target();
    const rounded = Math.round(t * 10) / 10;
    // If first decimal is 0, show no decimals (e.g., 51.0% -> 51%)
    return rounded % 1 === 0 ? `${rounded.toFixed(0)}%` : `${rounded.toFixed(1)}%`;
  });

  // Palette
  const palette = createMemo(() => {
    const reversed = String(props.colors || "normal") === "reversed";
    return reversed
      ? {
          track: "bg-[hsl(var(--primary))]",
          trackBorder: "border-[hsl(var(--card))]/30",
          trackBorderColor: "hsl(var(--card))",
          fillBase: "bg-[hsl(var(--card))]",
          textOnTrack: "hsl(var(--card))",
          textOnFill: "hsl(var(--primary))",
        }
      : {
          track: "bg-[hsl(var(--muted))]",
          trackBorder: "border-[hsl(var(--primary))]/40",
          trackBorderColor: "hsl(var(--primary))",
          fillBase: "bg-[hsl(var(--primary))]",
          textOnTrack: "hsl(var(--primary))",
          textOnFill: "hsl(var(--muted))",
        };
  });

  return (
    <div class={`relative ${showTargetMarker() ? 'h-10' : 'h-6'}`}>
      <div
        class={`w-full h-6 rounded-full overflow-hidden flex border ${palette().track} ${palette().trackBorder}`}
        role="progressbar"
        aria-valuenow={percentage()}
        aria-valuemin="0"
        aria-valuemax="100"
      >
        <div
          class={`h-full rounded-full transition-[width] duration-300 ${
            targetReached() ? "bg-green-600" : palette().fillBase
          }`}
          style={{ width: `${filledPortion()}%` }}
        />
      </div>

      {/* Target marker - only show if target is not 100% */}
      <Show when={showTargetMarker()}>
        {/* Target percentage label - positioned right or left based on available space */}
        <div
          class="absolute pointer-events-none transition-[left] duration-300 whitespace-nowrap leading-none"
          style={{
            top: "1.5rem",
            left: target() > 85 ? 'auto' : `calc(${target()}% + 0.375rem)`,
            right: target() > 85 ? `calc(${100 - target()}% + 0.375rem)` : 'auto',
            color: palette().trackBorderColor
          }}
        >
          <span class="text-[10px] font-semibold">
            {formatTargetPercent()}
          </span>
        </div>
        {/* Vertical line from top of bar to bottom of control - same color as bar border */}
        <div
          class="absolute top-0 bottom-0 w-px pointer-events-none transition-[left] duration-300"
          style={{
            left: `${target()}%`,
            "background-color": palette().trackBorderColor
          }}
          title={`Target: ${target().toFixed(1)}%`}
        />
      </Show>
      {/* Text visible on the track (unfilled portion) */}
      <div
        class="absolute top-0 left-0 right-0 h-6 flex items-center justify-center pointer-events-none overflow-hidden"
        style={{
          "clip-path": `inset(0 0 0 ${filledPortion()}%)`,
        }}
      >
        <span
          class="text-xs font-semibold tabular-nums whitespace-nowrap"
          style={{ color: palette().textOnTrack }}
        >
          {percentage().toFixed(1)}%
        </span>
      </div>
      {/* Text visible on the fill (filled portion) */}
      <div
        class="absolute top-0 left-0 right-0 h-6 flex items-center justify-center pointer-events-none overflow-hidden"
        style={{
          "clip-path": `inset(0 ${100 - filledPortion()}% 0 0)`,
        }}
      >
        <span
          class="text-xs font-semibold tabular-nums whitespace-nowrap"
          style={{
            color: targetReached() ? "#f0fdf4" : palette().textOnFill,
          }}
        >
          {percentage().toFixed(1)}%
        </span>
      </div>
    </div>
  );
}
