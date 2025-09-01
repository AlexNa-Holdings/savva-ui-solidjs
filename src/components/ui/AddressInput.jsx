// src/components/ui/AddressInput.jsx
import { createSignal, createMemo, createResource, Show, For, onCleanup } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";
import IpfsImage from "./IpfsImage.jsx";
import UnknownUserIcon from "./icons/UnknownUserIcon.jsx";
import UserCard from "./UserCard.jsx";
import { navigate } from "../../routing/hashRouter.js";

function isHexAddress(s) {
  const v = String(s || "").trim();
  return /^0x[0-9a-fA-F]{40}$/.test(v);
}

export default function AddressInput(props) {
  const app = useApp();
  const { t } = app;

  const [text, setText] = createSignal(String(props.value || "").trim());
  const [open, setOpen] = createSignal(false);
  const [hoverIdx, setHoverIdx] = createSignal(-1);
  const [pickedUser, setPickedUser] = createSignal(null);

  let inputRef;
  let debounceTimer;

  const domain = createMemo(() => app.selectedDomainName?.() || "");

  // Debounced query
  const [q, setQ] = createSignal("");
  function scheduleSearch(next) {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => setQ(next), 160);
  }
  onCleanup(() => clearTimeout(debounceTimer));

  const [results] = createResource(
    () => ({ domain: domain(), query: q() }),
    async ({ domain, query }) => {
      if (!query) return [];
      try {
        const list = await app.wsCall?.("search-user", { domain, query });
        return Array.isArray(list) ? list : [];
      } catch {
        return [];
      }
    }
  );

  function emitChange(addr) {
    props.onChange?.(addr);
  }

  function chooseUser(u) {
    if (!u) return;
    const addr = String(u.address || "").trim();
    setText(addr);
    setOpen(false);
    setPickedUser(u);
    emitChange(addr);
    props.onUserSelect?.(u);
  }

  function clearPicked() {
    setPickedUser(null);
    setTimeout(() => inputRef?.focus(), 0);
  }

  function onInput(e) {
    const v = e.currentTarget.value;
    setText(v);
    setPickedUser(null);
    const trimmed = String(v || "").trim();

    if (trimmed.length === 0) {
      setOpen(false);
      scheduleSearch("");
      emitChange("");
      return;
    }

    // Always allow backend search by partial text or partial address
    scheduleSearch(trimmed);
    setOpen(true);
    emitChange(trimmed);
  }

  function onKeyDown(e) {
    if (!open()) return;
    const items = results() || [];
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHoverIdx((i) => Math.min(items.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHoverIdx((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      if (hoverIdx() >= 0 && items[hoverIdx()]) {
        e.preventDefault();
        chooseUser(items[hoverIdx()]);
      } else if (isHexAddress(text())) {
        e.preventDefault();
        setOpen(false);
        setPickedUser(null);
        emitChange(text());
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    }
  }

  function goProfile(u) {
    if (!u) return;
    const path = u.name ? `/@${u.name}` : `/${u.address}`;
    navigate(path);
  }

  return (
    <div class={`relative ${props.class || ""}`}>
      <label class="block text-sm">
        <div class="mb-1">{props.label || t("wallet.transfer.to")}</div>

        {/* When a user is selected — show the FULL UserCard */}
        <Show
          when={pickedUser()}
          fallback={
            <div class="relative">
              <input
                ref={inputRef}
                value={text()}
                onInput={onInput}
                onKeyDown={onKeyDown}
                onFocus={() => { if (text().trim()) setOpen(true); }}
                placeholder={props.placeholder || t("addressInput.placeholder")}
                class="w-full rounded-md border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3 py-2 pr-9 outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
                autocomplete="off"
                inputmode="text"
              />
              <Show when={isHexAddress(text())}>
                <span class="absolute right-2 top-1/2 -translate-y-1/2 text-[hsl(var(--muted-foreground))] text-xs">{t("common.ok")}</span>
              </Show>
            </div>
          }
        >
          <div class="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[hsl(var(--card-foreground))] p-2">
            {/* IMPORTANT: UserCard expects `author`, not `user` */}
            <UserCard
              author={pickedUser()}
              clickable
              onClick={() => goProfile(pickedUser())}
            />
            <div class="mt-2 flex items-center justify-end">
              <button
                type="button"
                class="px-2 py-1 text-xs rounded-md border border-[hsl(var(--border))] hover:bg-[hsl(var(--accent))]"
                onClick={clearPicked}
                aria-label={t("common.change")}
                title={t("common.change")}
              >
                {t("common.change")}
              </button>
            </div>
          </div>
        </Show>
      </label>

      {/* Suggestions */}
      <Show when={open() && (results()?.length || 0) > 0}>
        <div class="absolute z-50 mt-1 w-full max-h-72 overflow-auto rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--popover))] text-[hsl(var(--popover-foreground))] shadow">
          <ul class="py-1">
            <For each={results()}>
              {(u, idx) => (
                <li>
                  <button
                    type="button"
                    class={`w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-[hsl(var(--accent))] ${hoverIdx() === idx() ? "bg-[hsl(var(--accent))]" : ""}`}
                    onMouseEnter={() => setHoverIdx(idx())}
                    onMouseLeave={() => setHoverIdx(-1)}
                    onClick={() => chooseUser(u)}
                  >
                    <span class="w-6 h-6 rounded overflow-hidden bg-[hsl(var(--muted))] flex-shrink-0">
                      <IpfsImage
                        src={u.avatar}
                        alt=""
                        class="w-full h-full object-cover"
                        fallback={<UnknownUserIcon class="w-full h-full object-cover" />}
                      />
                    </span>
                    <div class="min-w-0">
                      <div class="text-sm leading-tight truncate">{u.name ? `@${u.name}` : (u.display_name || t("profile.user"))}</div>
                      <div class="text-xs text-[hsl(var(--muted-foreground))] truncate">{u.address}</div>
                    </div>
                  </button>
                </li>
              )}
            </For>
          </ul>
        </div>
      </Show> 
    </div>
  );
}
