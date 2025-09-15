// src/x/ui/UserCard.jsx
import { Show, createMemo } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";
import IpfsImage from "./IpfsImage.jsx";
import UnknownUserIcon from "./icons/UnknownUserIcon.jsx";
import VerifiedBadge from "./icons/VerifiedBadge.jsx";
import StakerLevelIcon from "./StakerLevelIcon.jsx";
import { navigate } from "../../routing/hashRouter.js";

function isVerified(a) {
  return Boolean(a && a.name);
}
function shortAddr(addr) {
  if (!addr) return "";
  return addr.slice(0, 6) + "…" + addr.slice(-4);
}

export default function UserCard(props) {
  const app = useApp();
  const { t } = app;
  const author = () => props.author || {};
  const uiLang = () => (app.lang?.() || "en").toLowerCase();

  const textColor = createMemo(() => props.textColorClass || "text-[hsl(var(--foreground))]");
  const mutedTextColor = createMemo(() => props.mutedTextColorClass || "text-[hsl(var(--muted-foreground))]");

  const isBanned = createMemo(() => !!author()?.banned);

  const displayName = createMemo(() => {
    const a = author();
    const addr = String(a.address || "").toLowerCase();
    const overlay = app.userDisplayNames?.()?.[addr]?.[uiLang()];
    return overlay ? overlay : (a.display_names?.[uiLang()] || a.display_name || "");
  });

  const displayAvatar = createMemo(() => {
    if (isBanned()) return null; // force default avatar for banned users
    const a = author();
    const addr = String(a.address || "").toLowerCase();
    const overlay = app.userAvatars?.()?.[addr];
    return overlay !== undefined ? overlay : a.avatar;
  });

  const hasName = createMemo(() => author().name || displayName() || author().display_name);

  const handleUserClick = (e) => {
    e.stopPropagation();
    const user = author();
    if (!user) return;
    const targetPath = user.name ? `/@${user.name}` : `/${user.address}`;
    navigate(targetPath);
  };

  return (
    <Show when={author()}>
      <div class={`flex items-center w-full ${props.compact ? "h-auto" : "h-10"}`}>
        <div class="flex items-center gap-2 cursor-pointer min-w-0" onClick={handleUserClick}>
          <Show when={!props.compact}>
            <div class="w-9 h-9 rounded-md overflow-hidden shrink-0 bg-[hsl(var(--muted))]">
              <Show when={displayAvatar()} fallback={<UnknownUserIcon class="w-full h-full object-cover" />}>
                <IpfsImage
                  src={displayAvatar()}
                  alt={`${author().name || t("default.user")} ${t("default.avatar")}`}
                  class="w-full h-full object-cover"
                />
              </Show>
            </div>
          </Show>

          <div class="min-w-0">
            {/* Banned state: red label + address only */}
            <Show when={isBanned()} fallback={
              <>
                <Show when={displayName() && !props.compact}>
                  <div class={`text-xs pt-1 truncate ${textColor()} w-full`}>
                    {displayName()}
                  </div>
                </Show>

                <div class={`flex items-center gap-0.5 min-w-0 ${props.compact ? "text-[11px]" : "text-xs"} ${mutedTextColor()}`}>
                  <Show when={author().name}>
                    <div class="min-w-0 flex items-center">
                      <span class="truncate uppercase font-semibold">{author().name}</span>
                      <Show when={isVerified(author())}>
                        <VerifiedBadge class="ml-0.5 w-3.5 h-3.5 shrink-0" />
                      </Show>
                    </div>
                  </Show>

                  <Show when={!hasName() && author().address}>
                    <span class="font-mono">{shortAddr(author().address)}</span>
                  </Show>

                  <StakerLevelIcon
                    staked={author().staked}
                    class={`${props.compact ? "w-5 h-4" : "w-7 h-6"} shrink-0`}
                  />
                </div>
              </>
            }>
              <div class={`text-xs pt-1 w-full text-[hsl(var(--destructive))] font-semibold`}>
                {t("user.banned")}
              </div>
              <div class={`flex items-center gap-0.5 min-w-0 ${props.compact ? "text-[11px]" : "text-xs"} ${mutedTextColor()}`}>
                <Show when={author().address}>
                  <span class="font-mono">{shortAddr(author().address)}</span>
                </Show>
              </div>
            </Show>
          </div>
        </div>
      </div>
    </Show>
  );
}
