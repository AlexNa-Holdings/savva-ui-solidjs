// src/x/pages/ContributePage.jsx
import { createMemo } from "solid-js";
import { useHashRouter } from "../../routing/hashRouter.js";
import ClosePageButton from "../ui/ClosePageButton.jsx";
import ContributeView from "../fundraising/ContributeView.jsx";
import { useApp } from "../../context/AppContext.jsx";

export default function ContributePage() {
    const app = useApp();
    const { t } = app;
    const { route } = useHashRouter();
    
    const campaignId = createMemo(() => {
        const path = route();
        const idStr = path.split('/')[2] || null;
        return idStr ? Number(idStr) : null;
    });

    const handleSuccess = () => {
        // The ContributeView component will automatically refetch its data.
        // No further action is needed here.
    };

    return (
        <main class="p-4 max-w-4xl mx-auto space-y-4">
            <ClosePageButton />
            <h2 class="text-2xl font-semibold">{t("fundraising.contribute.pageTitle")} #{campaignId()}</h2>
            <div class="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[hsl(var(--card-foreground))]">
                <ContributeView
                    campaignId={campaignId()}
                    onSuccess={handleSuccess}
                    showCancel={false}
                />
            </div>
        </main>
    );
}