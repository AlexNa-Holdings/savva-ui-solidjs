// src/components/ui/UserCard.jsx
import { Show } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";
import IpfsImage from "./IpfsImage.jsx";
import UnknownUserIcon from "./icons/UnknownUserIcon.jsx";
import VerifiedBadge from "./icons/VerifiedBadge.jsx";
import StakerLevelIcon from "./StakerLevelIcon.jsx";

function isVerified(a) {
    return Boolean(a && a.name);
}

export default function UserCard(props) {
    const { t } = useApp();
    const author = () => props.author || {};

    return (
        <Show when={author()}>
            <div class="flex items-center gap-2 w-full h-10">
                <div class="w-8 h-8 rounded-full overflow-hidden shrink-0 bg-[hsl(var(--muted))]">
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

                <div class="min-w-0 flex-1">
                    <Show when={author().display_name}>
                        <div class="text-xs truncate text-[hsl(var(--foreground))]">
                            {author().display_name}
                        </div>
                    </Show>

                    <div class="flex items-center gap-1 text-xs text-[hsl(var(--muted-foreground))] min-w-0">
                        <Show when={author().name}>
                            <div class="min-w-0 flex items-center">
                                <span class="truncate uppercase font-semibold">{author().name}</span>
                                <Show when={isVerified(author())}>
                                    <VerifiedBadge class="ml-0.5 w-3.5 h-3.5 shrink-0" />
                                </Show>
                            </div>
                        </Show>

                        <StakerLevelIcon
                            staked={author().staked}
                            class="w-6 h-6 shrink-0 text-[hsl(var(--muted-foreground))]"
                        />
                    </div>
                </div>
            </div>
        </Show>
    );
}