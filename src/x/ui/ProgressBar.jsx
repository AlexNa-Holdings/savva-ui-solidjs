// src/x/ui/ProgressBar.jsx
import { Show, createMemo } from "solid-js";

/** value: percentage (0..∞), we cap the fill at 100% while label shows the real value */
export default function ProgressBar(props) {
  const capped = createMemo(() => Math.max(0, Math.min(100, Number(props.value ?? 0))));
  return (
    <div class="w-full h-2 rounded-full bg-[hsl(var(--muted))] overflow-hidden" role="progressbar" aria-valuenow={Number(props.value ?? 0)} aria-valuemin="0" aria-valuemax="100">
      <div class="h-full bg-[hsl(var(--primary))] transition-[width] duration-300" style={{ width: `${capped()}%` }} />
    </div>
  );
}
