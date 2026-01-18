// src/x/actors/ActorBadge.jsx
import { Show, For, createSignal, onMount, onCleanup } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";
import IpfsImage from "../ui/IpfsImage.jsx";
import UnknownUserIcon from "../ui/icons/UnknownUserIcon.jsx";
import NpoIcon from "../ui/icons/NpoIcon.jsx";

export default function ActorBadge() {
  const app = useApp();
  const { t } = app;

  const [open, setOpen] = createSignal(false);
  let menuRef;

  const isNpo = () => app.isActingAsNpo?.() === true;
  const actorUser = () => app.actorProfile?.() || app.authorizedUser?.();
  const items = () => app.npoMemberships?.() || [];

  const lang = () => app.lang?.() || "en";
  const shortAddr = (addr) => (addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : "");

  // Primary label rules: reg name + star  >  display name  >  short address
  const PrimaryLabel = (props) => {
    const u = () => props.user || {};
    const name = () => u()?.name; // registered unique name
    const display = () => u()?.display_names?.[lang()];
    const addr = () => u()?.address;

    return (
      <div class="inline-flex items-center">
        <Show when={name()} fallback={<span class="truncate">{display() || shortAddr(addr())}</span>}>
          <>
            <span style={{ color: "#FF7100" }}>★</span>
            <span class="truncate">{name()}</span>
          </>
        </Show>
      </div>
    );
  };

  async function ensureNposLoaded() {
    if (!app.authorizedUser?.()) return;
    if (items().length > 0) return;
    try { await app.refreshNpoMemberships?.(); } catch {}
  }

  async function toggle() {
    if (!open()) await ensureNposLoaded();
    setOpen(!open());
  }

  async function selectSelf() {
    try { await app.actAsSelf?.(); } finally { setOpen(false); }
  }

  async function selectNpo(npo) {
    const addr = String(npo?.address || "").trim();
    if (!addr) return;
    try { await app.actAsNpo?.(addr); } finally { setOpen(false); }
  }

  function onDocClick(e) { if (menuRef && !menuRef.contains(e.target)) setOpen(false); }
  onMount(() => document.addEventListener("mousedown", onDocClick));
  onCleanup(() => document.removeEventListener("mousedown", onDocClick));

  const selectedCheck = (addr) =>
    isNpo() && String(app.actorAddress?.() || "").toLowerCase() === String(addr || "").toLowerCase();

  return (
    <Show when={app.authorizedUser?.()}>
      <div class="relative" ref={menuRef}>
        {/* Control */}
        <button
          onClick={toggle}
          type="button"
          aria-haspopup="true"
          aria-expanded={open()}
          title={isNpo() ? t("actor.badge.titleNpo") : t("actor.badge.titleSelf")}
          class="flex items-center gap-2 px-2 py-1 rounded-full border border-[hsl(var(--input))] hover:bg-[hsl(var(--accent))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
        >
          {/* Self mode: only NpoIcon */}
          <Show when={!isNpo()} fallback={
            // NPO mode: NpoIcon + "Acting as:" + NPO avatar
            <div class="flex items-center gap-2">
              <NpoIcon class="w-4 h-4 opacity-90" />
              <span class="text-xs">{t("actor.actingAs")}</span>
              <div class="w-5 h-5 rounded overflow-hidden bg-[hsl(var(--muted))]">
                <IpfsImage
                  src={actorUser()?.avatar}
                  alt={t("profile.avatarAlt")}
                  fallback={<UnknownUserIcon class="w-full h-full" />}
                />
              </div>
            </div>
          }>
            <NpoIcon class="w-5 h-5 opacity-90" />
          </Show>
        </button>

        {/* Menu (narrower width) */}
        <Show when={open()}>
          <div
            class="absolute right-0 mt-2 w-52 p-2 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[hsl(var(--card-foreground))] shadow-lg z-50"
            role="menu"
          >
            {/* Self */}
            <button
              class="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-[hsl(var(--accent))]"
              onClick={selectSelf}
              type="button"
            >
              <div class="w-7 h-7 rounded overflow-hidden bg-[hsl(var(--muted))]">
                <IpfsImage
                  src={app.authorizedUser?.()?.avatar}
                  alt={t("profile.avatarAlt")}
                  fallback={<UnknownUserIcon class="w-full h-full" />}
                />
              </div>
              <div class="flex-1 min-w-0 text-left">
                <div class="text-sm leading-tight truncate">
                  <PrimaryLabel user={app.authorizedUser?.()} />
                </div>
                <div class="text-[10px] text-[hsl(var(--muted-foreground))] font-mono truncate">
                  {shortAddr(app.authorizedUser?.()?.address)}
                </div>
              </div>
              <Show when={!isNpo()}>
                <span class="text-xs">✓</span>
              </Show>
            </button>

            <div class="my-2 h-px bg-[hsl(var(--border))]" />

            {/* NPOs */}
            <Show when={items().length > 0} fallback={
              <div class="px-2 py-1.5 text-sm text-[hsl(var(--muted-foreground))]">{t("actor.noNpoAvailable")}</div>
            }>
              <div class="max-h-64 overflow-y-auto">
                <For each={items()}>
                  {(it) => (
                    <button
                      class="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-[hsl(var(--accent))]"
                      onClick={() => selectNpo(it)}
                      type="button"
                    >
                      <div class="w-7 h-7 rounded overflow-hidden bg-[hsl(var(--muted))]">
                        <IpfsImage
                          src={it?.user?.avatar || it?.avatar}
                          alt={t("profile.avatarAlt")}
                          fallback={<UnknownUserIcon class="w-full h-full" />}
                        />
                      </div>
                      <div class="flex-1 min-w-0 text-left">
                        <div class="text-sm leading-tight truncate">
                          <PrimaryLabel user={it?.user || it} />
                        </div>
                        <div class="text-[10px] text-[hsl(var(--muted-foreground))] font-mono truncate">
                          {shortAddr(it?.address)}
                        </div>
                      </div>
                      <Show when={selectedCheck(it?.address)}>
                        <span class="text-xs">✓</span>
                      </Show>
                    </button>
                  )}
                </For>
              </div>
            </Show>

            <div class="mt-2 flex justify-end">
              <button
                class="px-2 py-1 text-xs rounded border border-[hsl(var(--input))] hover:bg-[hsl(var(--accent))]"
                onClick={() => setOpen(false)}
                type="button"
              >
                {t("common.close")}
              </button>
            </div>
          </div>
        </Show>
      </div>
    </Show>
  );
}
