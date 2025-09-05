// src/x/post/PostRightPanel.jsx
import StickyClamp from "../layout/StickyClamp.jsx";
import PostFundCard from "./PostFundCard.jsx";
import FundraisingCard from "./FundraisingCard.jsx";
import { Show } from "solid-js";

export default function PostRightPanel(props) {
    const details = () => props.details?.();
    // Keep the rail visible on desktop, with the same sticky+clamp logic
    // offsetTop ≈ header + breathing (tweak if you change header height)
    return (
        <StickyClamp class="hidden lg:block sv-aside" offsetTop={56}>
            <div class="space-y-2">
                <Show when={details()?.descriptor?.fundraiser > 0}>
                    <FundraisingCard campaignId={details().descriptor.fundraiser} onContribute={props.onOpenContributeModal} />
                </Show>
                <Show when={props.post}>
                    <PostFundCard post={props.post} />
                </Show>
            </div>
        </StickyClamp>
    );
}