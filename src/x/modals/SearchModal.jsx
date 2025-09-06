// src/x/modals/SearchModal.jsx
import { createSignal, onMount, onCleanup } from "solid-js";
import { Portal } from "solid-js/web";
import { useApp } from "../../context/AppContext.jsx";
import SearchIcon from "../ui/icons/SearchIcon.jsx";
import SearchResults from "../search/SearchResults.jsx";
import useSearch from "../search/useSearch.js";
import ModalAutoCloser from "./ModalAutoCloser.jsx";
import ModalBackdrop from "./ModalBackdrop.jsx";

export default function SearchModal(props) {
  const { t } = useApp();
  let inputRef;
  const [enter, setEnter] = createSignal(false);
  const [q, setQ] = createSignal("");
  const close = () => props.onClose?.();
  const search = useSearch(q);

  onMount(() => {
    const onKey = (e) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    requestAnimationFrame(() => { setEnter(true); inputRef?.focus(); });
    onCleanup(() => {
      window.removeEventListener("keydown", onKey);
      document.documentElement.style.overflow = prevOverflow;
    });
  });

  return (
    <Portal>
      <div class="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-labelledby="sv-search-title">
        <ModalBackdrop onClick={close} />
        <div
          class={`fixed left-0 right-0 top-0 transition-transform duration-300 ease-out ${
            enter() ? "translate-y-0" : "-translate-y-full"
          }`}
          onClick={(e) => e.stopPropagation()}
        >
          <div class="sv-container p-3">
            <div class="rounded-2xl shadow-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))]">
              <ModalAutoCloser onClose={close} />
              <div class="flex items-center gap-2 p-3">
                <SearchIcon class="w-5 h-5 shrink-0 text-[hsl(var(--muted-foreground))]" aria-hidden="true" />
                <input
                  ref={(el) => (inputRef = el)}
                  type="text"
                  placeholder={t("search.placeholder")}
                  aria-label={t("search.title")}
                  value={q()}
                  onInput={(e) => setQ(e.currentTarget.value)}
                  class="w-full bg-[hsl(var(--background))] text-[hsl(var(--foreground))] border border-[hsl(var(--input))]
                         rounded-xl px-3 py-3 text-lg md:text-xl outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
                />
                <button
                  type="button"
                  class="px-3 py-2 rounded-lg border border-[hsl(var(--border))] hover:bg-[hsl(var(--accent))] hover:text-[hsl(var(--foreground))]"
                  title={t("common.close")}
                  aria-label={t("common.close")}
                  onClick={close}
                >
                  {t("common.close")}
                </button>
              </div>

              <div class="px-3 pb-2 text-sm text-[hsl(var(--muted-foreground))]" id="sv-search-title">
                {t("search.title")}
              </div>

              <div class="px-3 pb-3">
                <SearchResults
                  query={q()}
                  users={search.users()}
                  posts={search.posts()}
                  loadingUsers={search.loadingUsers()}
                  loadingPosts={search.loadingPosts()}
                  hasMoreUsers={search.hasMoreUsers()}
                  hasMorePosts={search.hasMorePosts()}
                  loadMoreUsers={search.loadMoreUsers}
                  loadMorePosts={search.loadMorePosts}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </Portal>
  );
}
