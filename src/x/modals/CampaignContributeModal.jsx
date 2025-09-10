// src/x/fundraising/CampaignContributeModal.jsx
import { Show } from "solid-js";
import ContributeView from "../fundraising/ContributeView.jsx";
import ModalAutoCloser from "../modals/ModalAutoCloser.jsx";
import ModalBackdrop from "../modals/ModalBackdrop.jsx";
import { Portal } from "solid-js/web";

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
            <portal>
            <div class="fixed inset-0 z-60 flex items-center justify-center p-4">
                <ModalBackdrop onClick={props.onClose} />
                <div class="relative z-70 w-full max-w-4xl rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[hsl(var(--card-foreground))] shadow-lg">
                    <ModalAutoCloser onClose={props.onClose} />
                    <ContributeView campaignId={props.campaignId} onSuccess={handleSuccess} />
                </div>
            </div>
            </portal>
        </Show>
    );
}