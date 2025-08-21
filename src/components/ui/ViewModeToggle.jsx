// src/components/ui/ViewModeToggle.jsx
import { useApp } from "../../context/AppContext.jsx";

function ListIcon(props) {
  return (
    <svg
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      width={props.size || "1.25em"}
      height={props.size || "1.25em"}
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      class={props.class}
    >
      <path d="M8 6L21 6.00078M8 12L21 12.0008M8 18L21 18.0007M3 6.5H4V5.5H3V6.5ZM3 12.5H4V11.5H3V12.5ZM3 18.5H4V17.5H3V18.5Z" />
    </svg>
  );
}

function GridIcon(props) {
  return (
    <svg
      viewBox="0 0 16 16"
      xmlns="http://www.w3.org/2000/svg"
      width={props.size || "1.25em"}
      height={props.size || "1.25em"}
      fill="currentColor"
      class={props.class}
    >
      <path
        fill-rule="evenodd"
        clip-rule="evenodd"
        d="M7 1H1V7H7V1ZM7 9H1V15H7V9ZM9 1H15V7H9V1ZM15 9H9V15H15V9Z"
      />
    </svg>
  );
}


/**
 * Compact 2-state toggle for "list" / "grid".
 * Props:
 *   value: "list" | "grid"
 *   onChange: (next) => void
 *   size?: "sm" | "md" (default md)
 *   class?: string
 */
export default function ViewModeToggle(props) {
  const { t } = useApp();
  const v = () => (props.value === "grid" ? "grid" : "list");
  const set = (next) => props.onChange && props.onChange(next);

  const sz = props.size === "sm" ? { box: "h-8 w-8", icon: "w-4 h-4" } : { box: "h-9 w-9", icon: "w-5 h-5" };
  const btnCls = (active) =>
    `inline-flex items-center justify-center ${sz.box} rounded-md border transition-colors ` +
    (active
      ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] border-[hsl(var(--primary))]"
      : "bg-[hsl(var(--muted))] text-[hsl(var(--foreground))] border-[hsl(var(--border))] hover:bg-[hsl(var(--accent))]");

  return (
    <div class={`inline-flex items-center gap-2 ${props.class || ""}`} role="group" aria-label={t("newTab.view.group")}>
      <button
        type="button"
        class={btnCls(v() === "list")}
        onClick={() => set("list")}
        aria-pressed={v() === "list" ? "true" : "false"}
        aria-label={t("newTab.view.list")}
        title={t("newTab.view.list")}
      >
        <ListIcon class={sz.icon} />
      </button>
      <button
        type="button"
        class={btnCls(v() === "grid")}
        onClick={() => set("grid")}
        aria-pressed={v() === "grid" ? "true" : "false"}
        aria-label={t("newTab.view.grid")}
        title={t("newTab.view.grid")}
      >
        <GridIcon class={sz.icon} />
      </button>
    </div>
  );
}
