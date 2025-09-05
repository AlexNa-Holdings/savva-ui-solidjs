// src/x/fundraising/DonatorsList.jsx
import { createSignal, onCleanup, onMount, For, Show, createEffect, on } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";
import UserCard from "../ui/UserCard.jsx";
import TokenValue from "../ui/TokenValue.jsx";
import Spinner from "../ui/Spinner.jsx";

const PAGE_SIZE = 20;

async function fetchDonators(params) {
    const { app, campaignId, offset } = params;
    if (!app.wsMethod || !campaignId) return { list: [], nextOffset: null };

    try {
        const listDonators = app.wsMethod("list-fr-donators");
        const res = await listDonators({
            id: campaignId,
            limit: PAGE_SIZE,
            offset: offset,
        });
        const list = Array.isArray(res) ? res : [];
        const nextOffset = list.length === PAGE_SIZE ? offset + PAGE_SIZE : null;
        return { list, nextOffset };
    } catch (e) {
        console.error(`Failed to fetch donators for campaign #${campaignId}`, e);
        return { list: [], nextOffset: null };
    }
}

export default function DonatorsList(props) {
    const app = useApp();
    const { t } = app;

    const [donators, setDonators] = createSignal([]);
    const [offset, setOffset] = createSignal(0);
    const [hasMore, setHasMore] = createSignal(true);
    const [loading, setLoading] = createSignal(false);

    let scrollContainerRef;

    const loadMore = async () => {
        if (loading() || !hasMore()) return;
        setLoading(true);

        const result = await fetchDonators({
            app,
            campaignId: props.campaignId,
            offset: offset()
        });

        if (result.list.length > 0) {
            setDonators(prev => [...prev, ...result.list]);
        }
        if (result.nextOffset !== null) {
            setOffset(result.nextOffset);
        } else {
            setHasMore(false);
        }

        setLoading(false);
    };

    onMount(() => {
        loadMore();
        const handleScroll = () => {
            if (!scrollContainerRef) return;
            const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef;
            if (scrollHeight - scrollTop <= clientHeight + 100) {
                loadMore();
            }
        };
        scrollContainerRef?.addEventListener('scroll', handleScroll, { passive: true });
        onCleanup(() => scrollContainerRef?.removeEventListener('scroll', handleScroll));
    });

    return (
        <div class="border-l border-[hsl(var(--border))] pl-4 h-full flex flex-col">
            <h4 class="text-base font-semibold mb-2 shrink-0">{t("fundraising.contribute.donatorsTitle")}</h4>
            <div ref={scrollContainerRef} class="flex-1 overflow-y-auto pr-2 space-y-2">
                <For each={donators()}>
                    {(donator) => (
                        <div class="flex items-center justify-between text-sm p-1.5 rounded hover:bg-[hsl(var(--accent))]">
                            <UserCard author={donator.user} compact={true} />
                            <TokenValue amount={donator.amount} tokenAddress={props.savvaTokenAddress} />
                        </div>
                    )}
                </For>
                <Show when={loading()}>
                    <div class="flex justify-center py-2"><Spinner class="w-5 h-5" /></div>
                </Show>
            </div>
        </div>
    );
}