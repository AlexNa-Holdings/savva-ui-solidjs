// src/x/pages/ContributePage.jsx
import { createMemo, createResource } from "solid-js";
import { useHashRouter } from "../../routing/smartRouter.js";
import ClosePageButton from "../ui/ClosePageButton.jsx";
import ContributeView from "../fundraising/ContributeView.jsx";
import { useApp } from "../../context/AppContext.jsx";
import { whenWsOpen } from "../../net/wsRuntime.js";
import { useMeta } from "../../lib/seo/headManager.js";
import { buildCanonical, getSiteName, ipfsPublicUrl } from "../../lib/seo/canonical.js";
import { titleFundraiser } from "../../lib/seo/templates.js";

// Lightweight fetch: meta lives at the page level (not inside ContributeView,
// which is reused as a modal in CampaignContributeModal). One extra ws call
// per page load; cheap.
async function fetchFundraiserMeta({ app, campaignId }) {
    if (!app?.wsMethod || !campaignId) return null;
    try {
        await whenWsOpen();
        const list = app.wsMethod("list-fundraisers");
        const res = await list({ id: campaignId, show_finished: true });
        const arr = Array.isArray(res) ? res : Array.isArray(res?.list) ? res.list : [];
        return arr[0] || null;
    } catch {
        return null;
    }
}

export default function ContributePage() {
    const app = useApp();
    const { t } = app;
    const { route } = useHashRouter();

    const campaignId = createMemo(() => {
        const path = route();
        const idStr = path.split('/')[2] || null;
        return idStr ? Number(idStr) : null;
    });

    const [fundraiserMeta] = createResource(
        () => (campaignId() ? { app, campaignId: campaignId() } : null),
        fetchFundraiserMeta,
    );

    useMeta(() => {
        const id = campaignId();
        if (!id) return null;
        const fr = fundraiserMeta();
        const lang = app.lang?.() || "en";
        const siteName = getSiteName(app);
        const author = fr?.user?.display_name || fr?.user?.name || fr?.user?.address || "";
        const title = fr?.title || `Fundraiser #${id}`;
        return {
            title: titleFundraiser(title, author, siteName),
            description: fr?.title || t("fundraising.contribute.pageTitle"),
            canonical: buildCanonical(app, `/fr/${id}`, lang),
            image: ipfsPublicUrl(app, fr?.thumbnail || fr?.user?.avatar),
            ogType: "article",
            twitterCard: "summary_large_image",
            siteName,
            locale: lang,
            robots: "index,follow",
        };
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