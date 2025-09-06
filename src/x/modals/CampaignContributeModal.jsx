// src/x/fundraising/CampaignContributeModal.jsx
import { Show } from "solid-js";
import ContributeView from "../fundraising/ContributeView.jsx";
import ModalAutoCloser from "../modals/ModalAutoCloser.jsx";
import ModalBackdrop from "../modals/ModalBackdrop.jsx";

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
                <ModalBackdrop onClick={props.onClose} />
                <div class="relative w-full max-w-4xl rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[hsl(var(--card-foreground))] shadow-lg">
                    <ModalAutoCloser onClose={props.onClose} />
                    <ContributeView campaignId={props.campaignId} onSuccess={handleSuccess} />
                </div>
            </div>
        </Show>
    );
}