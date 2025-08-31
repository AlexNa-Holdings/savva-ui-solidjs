// src/components/auth/AuthorizedUser.jsx
import { createSignal, Show, onMount, onCleanup } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";
import IpfsImage from "../ui/IpfsImage.jsx";
import UnknownUserIcon from "../ui/icons/UnknownUserIcon.jsx";
import { navigate } from "../../routing/hashRouter.js";

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
  const [menuOpen, setMenuOpen] = createSignal(false);
  let menuRef;
  
  const user = () => app.authorizedUser();

  const handleLogoutClick = () => {
    app.logout();
    setMenuOpen(false);
  };

  const handleProfileClick = () => {
    const u = user();
    if (!u) return;
    const path = u.name ? `/@${u.name}` : `/${u.address}`;
    navigate(path);
    setMenuOpen(false);
  };
  
  const handleClickOutside = (event) => {
    if (menuRef && !menuRef.contains(event.target)) {
      setMenuOpen(false);
    }
  };

  onMount(() => document.addEventListener("mousedown", handleClickOutside));
  onCleanup(() => document.removeEventListener("mousedown", handleClickOutside));

  return (
    <div class="relative" ref={menuRef}>
      <Show when={user()}>
        <button
          class="flex items-center gap-1 p-0.5 rounded-full border-2 border-transparent hover:border-[hsl(var(--primary))]"
          onClick={() => setMenuOpen(!menuOpen())}
          aria-haspopup="true"
          aria-expanded={menuOpen()}
        >
          <div class="w-7 h-7 rounded-full overflow-hidden shrink-0 bg-[hsl(var(--muted))]">
            <IpfsImage
              src={user().avatar}
              alt="User Avatar"
              class="w-full h-full object-cover"
              fallback={<UnknownUserIcon class="w-full h-full object-cover" />}
            />
          </div>
          <ChevronDownIcon class="w-4 h-4 text-[hsl(var(--muted-foreground))]" />
        </button>
      </Show>

      <Show when={menuOpen()}>
        <div class="absolute top-full right-0 mt-2 w-48 rounded-md shadow-lg bg-[hsl(var(--popover))] text-[hsl(var(--popover-foreground))] ring-1 ring-black ring-opacity-5 z-50">
          <div class="py-1" role="menu" aria-orientation="vertical">
            <a
              href="#"
              class="block px-4 py-2 text-sm hover:bg-[hsl(var(--accent))]"
              role="menuitem"
              onClick={(e) => { e.preventDefault(); handleProfileClick(); }}
            >
              {t("header.myProfile")}
            </a>
            <a
              href="#"
              class="block px-4 py-2 text-sm hover:bg-[hsl(var(--accent))]"
              role="menuitem"
              onClick={(e) => { e.preventDefault(); handleLogoutClick(); }}
            >
              {t("header.logout")}
            </a>
          </div>
        </div>
      </Show>
    </div>
  );
}
