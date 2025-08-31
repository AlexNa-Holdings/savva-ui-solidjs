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
import ConfirmModal from "../components/ui/ConfirmModal.jsx";
import { createPublicClient, http } from "viem";

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

        const [avatarCid, profileCid, name] = await Promise.all([
            userProfileContract.read.avatars([userAddress]),
            userProfileContract.read.getString([
                userAddress,
                toHexBytes32(app.selectedDomainName()),
                toHexBytes32("profile_cid")
            ]),
            userProfileContract.read.names([userAddress])
        ]);

        let ipfsData = {};
        if (profileCid) {
            const { data } = await ipfs.getJSONBest(app, profileCid);
            ipfsData = data || {};
        }

        return {
            address: userAddress,
            avatar: avatarCid,
            profile: ipfsData,
            name: name
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
    let debounceTimer;

    const [showAvatarEditor, setShowAvatarEditor] = createSignal(false);
    const [initialName, setInitialName] = createSignal("");
    const [nameInput, setNameInput] = createSignal("");
    const [nameError, setNameError] = createSignal("");
    const [isCheckingName, setIsCheckingName] = createSignal(false);
    const [isRegistering, setIsRegistering] = createSignal(false);
    const [showConfirmNameChange, setShowConfirmNameChange] = createSignal(false);

    const identifier = createMemo(() => {
        const path = route();
        return path.split('/')[2] || "";
    });

    const [profileData, { refetch }] = createResource(() => ({ app, identifier: identifier() }), fetchProfileForEdit);

    const [avatar, setAvatar] = createSignal("");
    const [about, setAbout] = createSignal({});
    const [activeLang, setActiveLang] = createSignal(uiLang());

    createEffect(() => {
        const data = profileData();
        if (data && !data.error) {
            setAvatar(data.avatar || "");
            const currentName = data.name || "";
            setInitialName(currentName);
            setNameInput(currentName);

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

    const handleNameInput = (e) => {
        const lowerValue = e.currentTarget.value.toLowerCase();
        setNameInput(lowerValue);
        setNameError("");

        if (lowerValue === initialName()) {
            setIsCheckingName(false);
            clearTimeout(debounceTimer);
            return;
        }

        const validCharRegex = /^[a-z0-9.-]*$/;
        if (!validCharRegex.test(lowerValue)) {
            setNameError(t("profile.edit.name.errorInvalidChar"));
            return;
        }
        
        clearTimeout(debounceTimer);
        if (lowerValue) {
            setIsCheckingName(true);
            debounceTimer = setTimeout(async () => {
                try {
                    const contract = await getSavvaContract(app, 'UserProfile');
                    const ownerAddress = await contract.read.owners([lowerValue]);
                    const checksummedOwner = ownerAddress !== '0x0000000000000000000000000000000000000000' 
                        ? toChecksumAddress(ownerAddress) 
                        : null;
                    
                    if (checksummedOwner && checksummedOwner.toLowerCase() !== profileData().address.toLowerCase()) {
                        setNameError(t("profile.edit.name.errorTaken"));
                    }
                } catch (err) {
                    console.error("Error checking name uniqueness:", err);
                } finally {
                    setIsCheckingName(false);
                }
            }, 500);
        } else {
            setIsCheckingName(false);
        }
    };

    const isRegisterDisabled = createMemo(() => {
        return isRegistering() || isCheckingName() || !!nameError() || !nameInput() || nameInput() === initialName();
    });

    const executeSetName = async () => {
      if (isRegisterDisabled()) return;
      setIsRegistering(true);
      setShowConfirmNameChange(false);
    
      try {
        const contract = await getSavvaContract(app, "UserProfile", { write: true });
        const hash = await contract.write.setName([nameInput()]);
        
        const desiredChain = app.desiredChain();
        const transport = http(desiredChain.rpcUrls[0]);
        const publicClient = createPublicClient({ chain: desiredChain, transport });
        
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        if (receipt.status !== 'success') {
          throw new Error(`Transaction failed with status: ${receipt.status}`);
        }
    
        pushToast({ type: 'success', message: t('profile.edit.name.registerSuccess') });
        setInitialName(nameInput()); // Update the "original" name to the new one
        refetch(); // Refetch profile data to get latest state
      } catch (err) {
        pushErrorToast(err, { context: t('profile.edit.name.registerError') });
      } finally {
        setIsRegistering(false);
      }
    };

    const handleRegisterName = () => {
        if (initialName()) {
            setShowConfirmNameChange(true);
        } else {
            executeSetName();
        }
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

                <Show 
                    when={walletAccount()} 
                    fallback={
                        <div class="p-4 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))]">
                            <p class="text-[hsl(var(--muted-foreground))] text-center">{t("profile.edit.connectWallet")}</p>
                        </div>
                    }
                >
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
                            <div class="space-y-6">
                                {/* Section 1: Cross Domain Settings */}
                                <div class="p-4 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] space-y-4">
                                    <h3 class="text-lg font-semibold">{t("profile.edit.crossDomainSettings")}</h3>
                                    <div class="flex items-start gap-6">
                                        <div 
                                            onClick={() => setShowAvatarEditor(true)}
                                            class="relative group w-48 h-48 rounded-2xl overflow-hidden bg-[hsl(var(--muted))] shrink-0 cursor-pointer"
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
                                        <div class="flex-1 space-y-4">
                                            <div>
                                                <label for="registered-name" class="font-medium">{t("profile.edit.registeredName")}</label>
                                                <input
                                                    id="registered-name"
                                                    type="text"
                                                    value={nameInput()}
                                                    onInput={handleNameInput}
                                                    classList={{ "border-[hsl(var(--destructive))]": !!nameError() }}
                                                    class="w-full px-3 py-2 rounded border bg-[hsl(var(--background))] text-[hsl(var(--foreground))] border-[hsl(var(--input))] mt-1"
                                                />
                                                <div class="mt-2 text-xs text-[hsl(var(--muted-foreground))] space-y-1">
                                                    <p>{t("profile.edit.name.help.line1")}</p>
                                                    <p>{t("profile.edit.name.help.line2")}</p>
                                                    <p>{t("profile.edit.name.help.line3")}</p>
                                                </div>
                                                <Show when={nameError()}>
                                                  <p class="mt-1 text-xs text-[hsl(var(--destructive))]">{nameError()}</p>
                                                </Show>
                                                <button 
                                                    class="mt-3 px-3 py-2 text-sm rounded bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90 disabled:opacity-60"
                                                    disabled={isRegisterDisabled()}
                                                    onClick={handleRegisterName}
                                                >
                                                    <Show when={isCheckingName() || isRegistering()} fallback={t("profile.edit.registerName")}>
                                                        <Spinner class="w-5 h-5" />
                                                    </Show>
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Section 2: Domain Specific Parameters */}
                                <div class="p-4 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] space-y-4">
                                    <h3 class="text-lg font-semibold">{t("profile.edit.domainSpecificParams")}</h3>
                                    <p class="text-sm text-[hsl(var(--muted-foreground))]">
                                        {t("profile.edit.domainLabel")}: <strong>{app.selectedDomainName()}</strong>
                                    </p>
                                    <div class="mt-2 space-y-2">
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
            <ConfirmModal
                isOpen={showConfirmNameChange()}
                onClose={() => setShowConfirmNameChange(false)}
                onConfirm={executeSetName}
                title={t("profile.edit.name.confirmChangeTitle")}
                message={t("profile.edit.name.confirmChangeMessage", { name: initialName() })}
            />
        </>
    );
}