// src/components/ui/UserCard.jsx
import { Show, createMemo } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";
import IpfsImage from "./IpfsImage.jsx";
import UnknownUserIcon from "./icons/UnknownUserIcon.jsx";
import VerifiedBadge from "./icons/VerifiedBadge.jsx";
import StakerLevelIcon from "./StakerLevelIcon.jsx";

function isVerified(a) {
    return Boolean(a && a.name);
}

// --- MODIFICATION: New helper function to shorten the address ---
function shortAddr(addr) {
  if (!addr) return "";
  return addr.slice(0, 6) + "…" + addr.slice(-4);
}

export default function UserCard(props) {
    const { t } = useApp();
    const author = () => props.author || {};

    const hasName = createMemo(() => author().name || author().display_name);

    return (
        <Show when={author()}>
            <div class={`flex items-center gap-2 w-full ${props.compact ? 'h-auto' : 'h-8'}`}>
                <Show when={!props.compact}>
                    <div class="w-7 h-7 rounded-full overflow-hidden shrink-0 bg-[hsl(var(--muted))]">
                        <Show
                            when={author().avatar}
                            fallback={<UnknownUserIcon class="w-full h-full object-cover" />}
                        >
                            <IpfsImage
                                src={author().avatar}
                                alt={`${author().name || t("default.user")} ${t("default.avatar")}`}
                                class="w-full h-full object-cover"
                            />
                        </Show>
                    </div>
                </Show>

                <div class="min-w-0 flex-1">
                    <Show when={author().display_name && !props.compact}>
                        <div class="text-xs truncate text-[hsl(var(--foreground))]">
                            {author().display_name}
                        </div>
                    </Show>

                    <div class={`flex items-center gap-1 min-w-0 ${props.compact ? 'text-[11px]' : 'text-xs'} text-[hsl(var(--muted-foreground))]`}>
                        <Show when={author().name}>
                            <div class="min-w-0 flex items-center">
                                <span class="truncate uppercase font-semibold">{author().name}</span>
                                <Show when={isVerified(author())}>
                                    <VerifiedBadge class="ml-0.5 w-3.5 h-3.5 shrink-0" />
                                </Show>
                            </div>
                        </Show>
                        
                        {/* --- MODIFICATION: Show address as a fallback --- */}
                        <Show when={!hasName() && author().address}>
                            <span class="font-mono">{shortAddr(author().address)}</span>
                        </Show>

                        <StakerLevelIcon
                            staked={author().staked}
                            class={`${props.compact ? 'w-4 h-4' : 'w-6 h-6'} shrink-0 text-[hsl(var(--muted-foreground))]`}
                        />
                    </div>
                </div>
            </div>
        </Show>
    );
}