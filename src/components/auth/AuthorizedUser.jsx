// src/components/auth/AuthorizedUser.jsx
import { createSignal, Show, onMount, onCleanup } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";
import IpfsImage from "../ui/IpfsImage.jsx";
import UnknownUserIcon from "../ui/icons/UnknownUserIcon.jsx";
import { navigate, useHashRouter } from "../../routing/hashRouter.js";

function ChevronDownIcon(props) {
  return (
    <svg viewBox="0 0 16 16" class={props.class || "w-4 h-4"} aria-hidden="true" fill="currentColor">
      <path d="M8 11.25a.75.75 0 01-.53-.22l-4-4a.75.75 0 111.06-1.06L8 9.94l3.47-3.47a.75.75 0 111.06 1.06l-4 4a.75.75 0 01-.53.22z"></path>
    </svg>
  );
}

export default function AuthorizedUser() {
  const app = useApp();
  const { t } = app;
  const { route } = useHashRouter();
  const [menuOpen, setMenuOpen] = createSignal(false);
  let menuRef;

  const user = () => app.authorizedUser();

  function go(target) {
    const current = route();
    const currentBase = current.split("?")[0];
    const targetBase = target.split("?")[0];
    navigate(target, { replace: currentBase === targetBase });
    setMenuOpen(false);
  }

  const handleProfileClick = () => {
    const u = user();
    if (!u) return;
    const path = u.name ? `/@${u.name}` : `/${u.address}`;
    go(path);
  };

  const handleWalletClick = () => {
    const u = user();
    if (!u) return;
    const basePath = u.name ? `/@${u.name}` : `/${u.address}`;
    go(`${basePath}?tab=wallet`);
  };

  const handleLogoutClick = () => {
    app.logout();
    setMenuOpen(false);
  };

  const handleClickOutside = (event) => {
    if (menuRef && !menuRef.contains(event.target)) setMenuOpen(false);
  };

  onMount(() => document.addEventListener("mousedown", handleClickOutside));
  onCleanup(() => document.removeEventListener("mousedown", handleClickOutside));

  return (
    <div class="relative" ref={menuRef}>
      <Show when={user()}>
        <button
          /* removed hover/focus border + hide outline/ring */
          class="flex items-center gap-1 p-0.5 rounded-full outline-none focus:outline-none focus-visible:outline-none ring-0 focus:ring-0"
          onClick={() => setMenuOpen(!menuOpen())}
          aria-haspopup="true"
          aria-expanded={menuOpen()}
        >
          <div class="w-7 h-7 rounded-md overflow-hidden shrink-0 bg-[hsl(var(--muted))]">
            <IpfsImage
              src={user().avatar}
              alt={t("profile.avatarAlt")}
              class="w-full h-full object-cover"
              fallback={<UnknownUserIcon class="w-full h-full object-cover" />}
            />
          </div>
          <ChevronDownIcon class="w-4 h-4 text-[hsl(var(--muted-foreground))]" />
        </button>
      </Show>

      <Show when={menuOpen()}>
        <div class="absolute right-0 mt-2 w-40 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[hsl(var(--card-foreground))] shadow">
          <button class="w-full text-left px-3 py-2 hover:bg-[hsl(var(--accent))]" onClick={handleProfileClick}>
            {t("profile.menu.myProfile")}
          </button>
          <button class="w-full text-left px-3 py-2 hover:bg-[hsl(var(--accent))]" onClick={handleWalletClick}>
            {t("profile.menu.myWallet")}
          </button>
          <button class="w-full text-left px-3 py-2 hover:bg-[hsl(var(--accent))]" onClick={handleLogoutClick}>
            {t("profile.menu.logout")}
          </button>
        </div>
      </Show>
    </div>
  );
}
