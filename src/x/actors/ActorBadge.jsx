// src/x/actors/ActorBadge.jsx
import { Show, For, createSignal, onMount, onCleanup } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";
// import { navigate } from "../../routing/hashRouter.js"; // ← removed
import IpfsImage from "../ui/IpfsImage.jsx";
import UnknownUserIcon from "../ui/icons/UnknownUserIcon.jsx";
import NpoIcon from "../ui/icons/NpoIcon.jsx";

export default function ActorBadge() {
  const app = useApp();
  const { t } = app;

  const [open, setOpen] = createSignal(false);
  let menuRef;

  const isNpo = () => app.actorIsNpo?.();
  const actorUser = () => app.actorProfile?.() || app.authorizedUser?.();

  const displayName = () => {
    const u = actorUser();
    return u?.display_names?.[app.lang?.()] || u?.name || (isNpo() ? t("actor.npo") : t("actor.self"));
  };

  async function ensureNposLoaded() {
    if (!app.wsMethod || !app.authorizedUser?.()) return;
    if ((app.npoList?.() || []).length > 0) return;

    try {
      const listNpo = app.wsMethod("list-npo");
      const res = await listNpo({
        confirmed_only: true,
        user_addr: app.authorizedUser().address,
        limit: 50,
        offset: 0,
      });
      const list = Array.isArray(res) ? res : (res?.list || []);
      app.setNpoList?.(list);
    } catch {
      /* ignore */
    }
  }

  const onToggle = async () => {
    if (!open()) await ensureNposLoaded();
    setOpen(!open());
  };

  const onSelectSelf = () => {
    app.setActingAsSelf?.();
    setOpen(false);
    // navigate("/"); // ← removed: stay on the same page
  };

  const onSelectNpo = (npo) => {
    app.setActingAsNpo?.(npo?.address || npo);
    setOpen(false);
    // navigate("/"); // ← removed: stay on the same page
  };

  const items = () => app.npoList?.() || [];

  function onDocClick(e) {
    if (menuRef && !menuRef.contains(e.target)) setOpen(false);
  }
  onMount(() => document.addEventListener("mousedown", onDocClick));
  onCleanup(() => document.removeEventListener("mousedown", onDocClick));

  return (
    <Show when={app.authorizedUser?.()}>
      <div class="relative" ref={menuRef}>
        <button
          class="flex items-center gap-2 px-2 py-1 rounded-full border border-[hsl(var(--input))] hover:bg-[hsl(var(--accent))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
          onClick={onToggle}
          aria-haspopup="true"
          aria-expanded={open()}
          title={isNpo() ? t("actor.badge.titleNpo") : t("actor.badge.titleSelf")}
          type="button"
        >
          <div class="w-5 h-5 rounded bg-[hsl(var(--muted))] overflow-hidden">
            <IpfsImage
              src={actorUser()?.avatar}
              alt={t("profile.avatarAlt")}
              fallback={<UnknownUserIcon class="w-full h-full" />}
            />
          </div>
          <span class="text-xs font-medium max-w-[12rem] truncate">
            {t("actor.actingAs")}: {displayName()}
          </span>
          <Show when={isNpo()}>
            <NpoIcon class="w-4 h-4 opacity-80" aria-label="NPO" />
          </Show>
        </button>

        <Show when={open()}>
          <div class="absolute right-0 mt-2 w-72 p-2 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[hsl(var(--card-foreground))] shadow-lg z-30">
            <div class="px-2 py-1 text-xs uppercase tracking-wide opacity-60">{t("actor.menu.title")}</div>

            <button
              class="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-[hsl(var(--accent))]"
              onClick={onSelectSelf}
              type="button"
            >
              <div class="w-6 h-6 rounded overflow-hidden bg-[hsl(var(--muted))]">
                <IpfsImage
                  src={app.authorizedUser()?.avatar}
                  alt={t("profile.avatarAlt")}
                  fallback={<UnknownUserIcon class="w-full h-full" />}
                />
              </div>
              <div class="flex-1 min-w-0">
                <div class="text-sm leading-tight truncate">{t("actor.menu.self")}</div>
                <div class="text-xs text-[hsl(var(--muted-foreground))] truncate">
                  {app.authorizedUser()?.name || app.authorizedUser()?.address}
                </div>
              </div>
              <Show when={!isNpo()}>
                <span class="text-xs">✓</span>
              </Show>
            </button>

            <div class="px-2 pt-2 pb-1 text-xs uppercase tracking-wide opacity-60">{t("actor.menu.npos")}</div>
            <Show when={items().length > 0} fallback={
              <div class="px-2 py-2 text-sm text-[hsl(var(--muted-foreground))]">{t("actor.menu.empty")}</div>
            }>
              <div class="max-h-64 overflow-auto">
                <For each={items()}>
                  {(it) => {
                    const name = it?.user?.display_names?.[app.lang?.()] || it?.user?.name || it?.name || it?.address;
                    const selected = () => isNpo() && app.actorNpo?.()?.address?.toLowerCase() === String(it?.address || "").toLowerCase();
                    return (
                      <button
                        class="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-[hsl(var(--accent))]"
                        onClick={() => onSelectNpo(it)}
                        type="button"
                      >
                        <div class="w-6 h-6 rounded overflow-hidden bg-[hsl(var(--muted))]">
                          <IpfsImage
                            src={it?.user?.avatar || it?.avatar}
                            alt={t("profile.avatarAlt")}
                            fallback={<UnknownUserIcon class="w-full h-full" />}
                          />
                        </div>
                        <div class="flex-1 min-w-0">
                          <div class="text-sm leading-tight truncate">{name}</div>
                          <div class="text-xs text-[hsl(var(--muted-foreground))] truncate">{it?.address}</div>
                        </div>
                        <NpoIcon class="w-4 h-4 opacity-80" aria-label="NPO" />
                        <Show when={selected()}>
                          <span class="text-xs">✓</span>
                        </Show>
                      </button>
                    );
                  }}
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
