// src/x/fundraising/CampaignContributeModal.jsx
import { Show } from "solid-js";
import ContributeView from "./ContributeView.jsx";

export default function CampaignContributeModal(props) {
    const handleClose = () => {
        props.onClose?.();
    };

    const handleSuccess = () => {
        props.onSuccess?.();
        handleClose();
    };
    
    return (
        <Show when={props.isOpen}>
            <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
                <div class="absolute inset-0 bg-black/40" onClick={handleClose} />
                <div class="relative w-full max-w-4xl rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[hsl(var(--card-foreground))] shadow-lg">
                    <ContributeView campaignId={props.campaignId} onSuccess={handleSuccess} />
                </div>
            </div>
        </Show>
    );
}