// src/pages/ProfileEditPage.jsx
import { createMemo, createResource, Show, createSignal, Switch, Match, createEffect } from "solid-js";
import { useApp } from "../context/AppContext.jsx";
import ClosePageButton from "../components/ui/ClosePageButton.jsx";
import { useHashRouter } from "../routing/hashRouter.js";
import { walletAccount } from "../blockchain/wallet.js";
import { getSavvaContract } from "../blockchain/contracts.js";
import { toChecksumAddress, toHexBytes32 } from "../blockchain/utils.js";
import { ipfs } from "../ipfs/index.js";
import Spinner from "../components/ui/Spinner.jsx";
import IpfsImage from "../components/ui/IpfsImage.jsx";
import UnknownUserIcon from "../components/ui/icons/UnknownUserIcon.jsx";
import LangSelector from "../components/ui/LangSelector.jsx";
import { EditIcon } from "../components/ui/icons/ActionIcons.jsx";
import AvatarEditorModal from "../components/profile/AvatarEditorModal.jsx";
import { httpBase } from "../net/endpoints.js";
import { pushErrorToast, pushToast } from "../ui/toast.js";

async function fetchProfileForEdit(params) {
    const { app, identifier } = params;
    if (!identifier) return { error: "No identifier provided." };

    try {
        const userProfileContract = await getSavvaContract(app, 'UserProfile');
        let userAddress;

        if (identifier.startsWith('@')) {
            const userName = identifier.substring(1).toLowerCase();
            const address = await userProfileContract.read.owners([userName]);
            if (!address || address === '0x0000000000000000000000000000000000000000') {
                return { error: "User does not exist." };
            }
            userAddress = toChecksumAddress(address);
        } else {
            userAddress = toChecksumAddress(identifier);
        }

        const avatarCid = await userProfileContract.read.avatars([userAddress]);
        const profileCid = await userProfileContract.read.getString([
            userAddress,
            toHexBytes32(app.selectedDomainName()),
            toHexBytes32("profile_cid")
        ]);

        let ipfsData = {};
        if (profileCid) {
            const { data } = await ipfs.getJSONBest(app, profileCid);
            ipfsData = data || {};
        }

        return {
            address: userAddress,
            avatar: avatarCid,
            profile: ipfsData
        };
    } catch (e) {
        console.error("Failed to fetch profile for editing:", e);
        return { error: e.message };
    }
}

export default function ProfileEditPage() {
    const app = useApp();
    const { t, lang: uiLang, domainAssetsConfig } = app;
    const { route } = useHashRouter();

    const [showAvatarEditor, setShowAvatarEditor] = createSignal(false);

    const identifier = createMemo(() => {
        const path = route();
        return path.split('/')[2] || "";
    });

    const [profileData] = createResource(() => ({ app, identifier: identifier() }), fetchProfileForEdit);

    const [avatar, setAvatar] = createSignal("");
    const [about, setAbout] = createSignal({});
    const [activeLang, setActiveLang] = createSignal(uiLang());

    createEffect(() => {
        const data = profileData();
        if (data && !data.error) {
            setAvatar(data.avatar || "");

            const profileAbout = data.profile?.about;
            if (typeof profileAbout === 'string') {
                setAbout({ [activeLang()]: profileAbout });
            } else if (typeof profileAbout === 'object' && profileAbout !== null) {
                setAbout(profileAbout);
            } else {
                setAbout({});
            }
        }
    });

    const domainLangCodes = createMemo(() => {
        const locales = domainAssetsConfig?.()?.locales || [];
        return locales.length > 0 ? locales.map(l => l.code) : ["en"];
    });
    
    const handleAboutChange = (e) => {
        const newText = e.currentTarget.value;
        setAbout(prev => ({ ...prev, [activeLang()]: newText }));
    };

    const handleAvatarSave = async (blob) => {
        try {
            const formData = new FormData();
            formData.append('file', blob, 'avatar.png');

            const response = await fetch(`${httpBase()}store`, {
                method: 'POST',
                body: formData,
                credentials: 'include'
            });

            if (!response.ok) throw new Error(`Avatar upload failed: ${response.status}`);
            const result = await response.json();
            const newCid = result?.cid;
            if (!newCid) throw new Error("API did not return a CID for the avatar.");

            const contract = await getSavvaContract(app, "UserProfile", { write: true });
            await contract.write.setAvatar([newCid]);
            
            pushToast({ type: "success", message: t("profile.edit.avatar.success") });
        } catch (e) {
            pushErrorToast(e, { context: "Avatar update failed" });
            throw e; // re-throw to keep modal's processing state correct
        }
    };

    return (
        <>
            <main class="p-4 max-w-3xl mx-auto space-y-6">
                <ClosePageButton />
                <div class="flex items-center justify-between">
                    <h2 class="text-2xl font-semibold">{t("profile.edit.title")}</h2>
                </div>

                <Show when={walletAccount()} fallback={
                    <div class="p-4 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))]">
                        <p class="text-[hsl(var(--muted-foreground))] text-center">Please connect your wallet to edit the profile.</p>
                    </div>
                }>
                    <Switch>
                        <Match when={profileData.loading}>
                            <div class="flex justify-center items-center h-48"><Spinner /></div>
                        </Match>
                        <Match when={profileData()?.error}>
                            <div class="p-4 rounded-lg border border-[hsl(var(--destructive))] bg-[hsl(var(--card))]">
                                <p class="text-red-500 text-center">{profileData().error}</p>
                            </div>
                        </Match>
                        <Match when={profileData()}>
                            <div class="p-4 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] space-y-4">
                                <h3 class="text-lg font-semibold">{t("profile.edit.generalInfo")}</h3>
                                <div class="flex items-center gap-6">
                                    <div 
                                        onClick={() => setShowAvatarEditor(true)}
                                        class="relative group w-48 h-48 rounded-full overflow-hidden bg-[hsl(var(--muted))] shrink-0 cursor-pointer"
                                    >
                                        <IpfsImage
                                            src={avatar()}
                                            alt="User Avatar"
                                            class="w-full h-full object-cover"
                                            fallback={<UnknownUserIcon class="w-full h-full object-cover text-[hsl(var(--muted-foreground))]" />}
                                        />
                                        <div class="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                            <EditIcon class="w-10 h-10 text-white" />
                                        </div>
                                    </div>
                                    <div class="flex-1 space-y-2">
                                        <div class="flex justify-end">
                                            <LangSelector
                                                codes={domainLangCodes()}
                                                value={activeLang()}
                                                onChange={setActiveLang}
                                            />
                                        </div>
                                        <textarea
                                            value={about()[activeLang()] || ""}
                                            onInput={handleAboutChange}
                                            class="w-full min-h-[120px] p-2 rounded border bg-[hsl(var(--background))] text-[hsl(var(--foreground))] border-[hsl(var(--input))]"
                                            placeholder="Tell us about yourself..."
                                        />
                                    </div>
                                </div>
                            </div>
                        </Match>
                    </Switch>
                </Show>
            </main>
            <AvatarEditorModal 
                isOpen={showAvatarEditor()}
                onClose={() => setShowAvatarEditor(false)}
                onSave={handleAvatarSave}
            />
        </>
    );
}