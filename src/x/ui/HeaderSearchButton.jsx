// src/x/ui/HeaderSearchButton.jsx
import { createSignal } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";
import SearchIcon from "./icons/SearchIcon.jsx";
import SearchModal from "../modals/SearchModal.jsx";

export default function HeaderSearchButton() {
  const { t } = useApp();
  const [open, setOpen] = createSignal(false);

  return (
    <>
      <button
        type="button"
        class="p-2 rounded-xl border border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--accent))] transition-colors"
        aria-label={t("common.search")}
        title={t("common.search")}
        onClick={() => setOpen(true)}
      >
        <SearchIcon class="w-5 h-5" />
      </button>

      {open() && <SearchModal isOpen={open()} onClose={() => setOpen(false)} />}
    </>
  );
}
