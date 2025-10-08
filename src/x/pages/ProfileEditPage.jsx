// src/x/pages/ProfileEditPage.jsx
import { createMemo, createResource, Show, createSignal, Switch, Match, createEffect, For } from "solid-js";
import { createStore, reconcile } from "solid-js/store";
import { useApp } from "../../context/AppContext.jsx";
import ClosePageButton from "../ui/ClosePageButton.jsx";
import { useHashRouter } from "../../routing/hashRouter.js";
import { walletAccount } from "../../blockchain/wallet.js";
import { getSavvaContract } from "../../blockchain/contracts.js";
import { toChecksumAddress, toHexBytes32 } from "../../blockchain/utils.js";
import { ipfs } from "../../ipfs/index.js";
import Spinner from "../ui/Spinner.jsx";
import IpfsImage from "../ui/IpfsImage.jsx";
import UnknownUserIcon from "../ui/icons/UnknownUserIcon.jsx";
import LangSelector from "../ui/LangSelector.jsx";
import { EditIcon } from "../ui/icons/ActionIcons.jsx";
import AvatarEditorModal from "../modals/AvatarEditorModal.jsx";
import { httpBase } from "../../net/endpoints.js";
import { pushErrorToast, pushToast } from "../../ui/toast.js";
import ConfirmModal from "../modals/ConfirmModal.jsx";
import ContextMenu from "../ui/ContextMenu.jsx";
import { sendAsActor } from "../../blockchain/npoMulticall.js";
import LinksEditor from "../profile/LinksEditor.jsx";
// ✅ import the shared profile store utilities
import useUserProfile, { applyProfileEditResult } from "../profile/userProfileStore.js";
import { generateReadingKey, publishReadingKey, fetchReadingKey } from "../crypto/readingKey.js";
import { storeReadingKey, deleteStoredReadingKeys, countStoredReadingKeys } from "../crypto/readingKeyStorage.js";
import StoreReadingKeyModal from "../modals/StoreReadingKeyModal.jsx";

async function fetchProfileForEdit(params) {
  const { app, identifier } = params;
  if (!identifier) return { error: "No identifier provided." };

  try {
    const userProfileContract = await getSavvaContract(app, "UserProfile");
    let userAddress;

    if (identifier.startsWith("@")) {
      const userName = identifier.substring(1).toLowerCase();
      const address = await userProfileContract.read.getOwner([userName]);
      if (!address || address === "0x0000000000000000000000000000000000000000") {
        return { error: "User does not exist." };
      }
      userAddress = toChecksumAddress(address);
    } else {
      userAddress = toChecksumAddress(identifier);
    }

    const [avatarCid, profileCid, name] = await Promise.all([
      userProfileContract.read.getAvatar([userAddress]),
      userProfileContract.read.getString([
        userAddress,
        toHexBytes32(app.selectedDomainName()),
        toHexBytes32("profile_cid"),
      ]),
      userProfileContract.read.getName([userAddress]),
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
      name: name,
      profile_cid: profileCid,
    };
  } catch (e) {
    console.error("Failed to fetch profile for editing:", e);
    return { error: e.message };
  }
}

function copyToClipboard(text, label, t) {
  if (!text) return;
  navigator.clipboard
    .writeText(text)
    .then(() => {
      pushToast({ type: "success", message: t("clipboard.copied", { label }) });
    })
    .catch((err) => {
      console.error(`Failed to copy ${label}:`, err);
    });
}

function filterEmptyValues(obj) {
  const newObj = {};
  for (const key in obj) {
    if (typeof obj[key] === "string" && obj[key].trim() !== "") {
      newObj[key] = obj[key];
    }
  }
  return newObj;
}

// Best-effort: get current actor address for the “actor==auth user” check.
function getActorAddress(app) {
  try {
    const a = app.actor?.();
    if (typeof a === "string") return a;
    if (a && typeof a === "object" && a.address) return a.address;
  } catch (_) { }
  try {
    if (typeof app.actorAddress === "function") return app.actorAddress();
    if (app.actorAddress) return app.actorAddress;
  } catch (_) { }
  // fallback: use auth address
  return app.authorizedUser?.()?.address;
}

export default function ProfileEditPage() {
  const app = useApp();
  const { cid } = useUserProfile(); // self profile hook (reactive)
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

  const [displayNames, setDisplayNames] = createStore({});
  const [nsfwPreference, setNsfwPreference] = createSignal("h");
  const [sponsorValues, setSponsorValues] = createStore(["", "", "", "", ""]);
  const [isSaving, setIsSaving] = createSignal(false);
  const [about, setAbout] = createStore({});

  const identifier = createMemo(() => {
    const path = route();
    return path.split("/")[2] || "";
  });

  const [profileData, { refetch }] = createResource(
    () => ({ app, identifier: identifier() }),
    fetchProfileForEdit
  );

  const [avatar, setAvatar] = createSignal("");
  const [activeLang, setActiveLang] = createSignal(uiLang());

  const profileCid = createMemo(() => profileData()?.profile_cid);
  const subjectAddress = createMemo(() => (profileData()?.address || "").toLowerCase());
  const authAddress = createMemo(() => (app.authorizedUser?.()?.address || "").toLowerCase());
  const actorAddress = createMemo(() => (getActorAddress(app) || "").toLowerCase());
  const [links, setLinks] = createStore([]);

  // Reading Key state
  const [readingKey, setReadingKey] = createSignal(null);
  const [isLoadingReadingKey, setIsLoadingReadingKey] = createSignal(false);
  const [isGeneratingReadingKey, setIsGeneratingReadingKey] = createSignal(false);
  const [showStoreKeyModal, setShowStoreKeyModal] = createSignal(false);
  const [pendingKeyToStore, setPendingKeyToStore] = createSignal(null);
  const [storedKeysCount, setStoredKeysCount] = createSignal(0);

  // true only if we're editing the auth user and we're acting as the auth user
  const isSelfActorEditingSelf = createMemo(
    () => subjectAddress() && authAddress() && actorAddress()
      ? subjectAddress() === authAddress() && actorAddress() === authAddress()
      : false
  );

  createEffect(() => {
    const data = profileData();
    if (data && !data.error) {
      setAvatar(data.avatar || "");
      const currentName = data.name || "";
      setInitialName(currentName);
      setNameInput(currentName);

      const profile = data.profile || {};
      setNsfwPreference(profile.nsfw || "h");

      const initialLinks = Array.isArray(profile.links)
        ? profile.links.map((l) => ({ title: String(l?.title || "").trim(), url: String(l?.url || "").trim() }))
        : [];
      setLinks(reconcile(initialLinks));

      let initialDisplayNames = {};
      if (profile.display_names && typeof profile.display_names === "object") {
        initialDisplayNames = profile.display_names;
      } else if (profile.display_name && typeof profile.display_name === "string") {
        initialDisplayNames = { [uiLang()]: profile.display_name };
      }
      setDisplayNames(reconcile(initialDisplayNames));

      const s_values = profile.sponsor_values;
      if (Array.isArray(s_values) && s_values.length > 0) {
        const filledValues = s_values.slice(0, 5).map((v) => v || "");
        while (filledValues.length < 5) filledValues.push("");
        setSponsorValues(reconcile(filledValues));
      } else {
        setSponsorValues(reconcile(["", "", "", "", ""]));
      }

      let initialAboutState = {};
      if (profile.about_me && typeof profile.about_me === "object") {
        initialAboutState = profile.about_me;
      } else if (profile.about && typeof profile.about === "string") {
        initialAboutState = { [uiLang()]: profile.about };
      }

      setAbout(reconcile(initialAboutState));
    }
  });

  createEffect(() => {
    const authorized = app.authorizedUser?.();
    const profile = profileData();

    if (authorized && profile && !profile.error && (authorized.address || "").toLowerCase() === (profile.address || "").toLowerCase()) {
      if (authorized.avatar !== avatar()) {
        setAvatar(authorized.avatar);
      }
    }
  });

  // Fetch reading key when profile loads
  createEffect(async () => {
    const data = profileData();
    if (data && !data.error && data.address && isSelfActorEditingSelf()) {
      setIsLoadingReadingKey(true);
      try {
        const key = await fetchReadingKey(app, data.address);
        setReadingKey(key);
      } catch (error) {
        console.error("Error fetching reading key:", error);
        setReadingKey(null);
      } finally {
        setIsLoadingReadingKey(false);
      }
    }
  });

  // Update stored keys count when profile loads or changes
  createEffect(() => {
    const data = profileData();
    if (data && !data.error && data.address && isSelfActorEditingSelf()) {
      const count = countStoredReadingKeys(data.address);
      setStoredKeysCount(count);
    }
  });

  const contextMenuItems = createMemo(() => {
    const cid = profileCid();
    if (!cid) return [];
    return [
      {
        label: t("profile.edit.copyProfileCid"),
        onClick: () => copyToClipboard(cid, "User Profile CID", t),
      },
    ];
  });

  const domainLangCodes = createMemo(() => {
    const locales = domainAssetsConfig?.()?.locales || [];
    return locales.length > 0 ? locales.map((l) => l.code) : ["en"];
  });

  const handleAboutChange = (e) => {
    setAbout(activeLang(), e.currentTarget.value);
  };

  const handleDisplayNameChange = (e) => {
    setDisplayNames(activeLang(), e.currentTarget.value);
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
          const contract = await getSavvaContract(app, "UserProfile");
          const ownerAddress = await contract.read.getOwner([lowerValue]);
          const checksummedOwner =
            ownerAddress !== "0x0000000000000000000000000000000000000000" ? toChecksumAddress(ownerAddress) : null;

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

  const handleSponsorValueChange = (index, value) => {
    setSponsorValues(index, value.replace(/[^0-9]/g, ""));
  };

  const isRegisterDisabled = createMemo(() => {
    return isRegistering() || isCheckingName() || !!nameError() || !nameInput() || nameInput() === initialName();
  });

  // Actor-aware: setName through current actor (NPO => multicall)
  const executeSetName = async () => {
    if (isRegisterDisabled()) return;
    setIsRegistering(true);
    setShowConfirmNameChange(false);

    try {
      await sendAsActor(app, {
        contractName: "UserProfile",
        functionName: "setName",
        args: [nameInput()],
      });

      pushToast({ type: "success", message: t("profile.edit.name.registerSuccess") });
      setInitialName(nameInput());
      refetch();
    } catch (err) {
      pushErrorToast(err, { context: t("profile.edit.name.registerError") });
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

  // Actor-aware: Avatar save
  const handleAvatarSave = async (blob) => {
    try {
      const formData = new FormData();
      formData.append("file", blob, "avatar.png");

      const response = await fetch(`${httpBase()}store`, {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      if (!response.ok) throw new Error(`Avatar upload failed: ${response.status}`);
      const result = await response.json();
      const newCid = result?.cid;
      if (!newCid) throw new Error("API did not return a CID for the avatar.");

      await sendAsActor(app, {
        contractName: "UserProfile",
        functionName: "setAvatar",
        args: [newCid],
      });

      pushToast({ type: "success", message: t("profile.edit.avatar.success") });
      refetch();
    } catch (e) {
      pushErrorToast(e, { context: t("profile.edit.avatar.error") });
      throw e;
    }
  };

  function sanitizeLinks(arr) {
    return (Array.isArray(arr) ? arr : [])
      .map((x) => ({
        title: String(x?.title || "").trim(),
        url: String(x?.url || "").trim(),
      }))
      .filter((x) => x.title || x.url);
  }

  // Actor-aware: Save profile JSON (write profile_cid via actor)
  const handleGenerateReadingKey = async () => {
    setIsGeneratingReadingKey(true);
    try {
      const data = profileData();
      if (!data?.address) {
        throw new Error("No address found");
      }

      // Generate the reading key (includes secretKey)
      const { nonce, publicKey, secretKey } = await generateReadingKey(data.address);

      // Publish to contract
      await publishReadingKey(app, publicKey, nonce);

      // Update local state
      setReadingKey({
        publicKey,
        scheme: "x25519-xsalsa20-poly1305",
        nonce,
      });

      pushToast({
        type: "success",
        message: readingKey()
          ? t("profile.edit.readingKey.renewSuccess")
          : t("profile.edit.readingKey.generateSuccess")
      });

      // Prompt user to store the secret key
      setPendingKeyToStore({ nonce, publicKey, secretKey, address: data.address });
      setShowStoreKeyModal(true);
    } catch (err) {
      pushErrorToast(err, {
        context: readingKey()
          ? t("profile.edit.readingKey.renewError")
          : t("profile.edit.readingKey.generateError")
      });
    } finally {
      setIsGeneratingReadingKey(false);
    }
  };

  const handleConfirmStoreKey = () => {
    const pending = pendingKeyToStore();
    if (pending) {
      const success = storeReadingKey(pending.address, {
        nonce: pending.nonce,
        publicKey: pending.publicKey,
        secretKey: pending.secretKey,
      });

      if (success) {
        pushToast({
          type: "success",
          message: t("readingKey.store.stored")
        });
        // Update count
        setStoredKeysCount(countStoredReadingKeys(pending.address));
      } else {
        pushToast({
          type: "error",
          message: t("readingKey.store.storeFailed")
        });
      }
    }

    setShowStoreKeyModal(false);
    setPendingKeyToStore(null);
  };

  const handleDeclineStoreKey = () => {
    setShowStoreKeyModal(false);
    setPendingKeyToStore(null);
  };

  const handleDeleteStoredKeys = () => {
    const data = profileData();
    if (!data?.address) return;

    const success = deleteStoredReadingKeys(data.address);
    if (success) {
      pushToast({
        type: "success",
        message: t("readingKey.store.deleted")
      });
      setStoredKeysCount(0);
    } else {
      pushToast({
        type: "error",
        message: t("readingKey.store.deleteFailed")
      });
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const profileJson = {
        display_names: filterEmptyValues({ ...displayNames }),
        nsfw: nsfwPreference(),
        about_me: filterEmptyValues({ ...about }),
        sponsor_values: [...sponsorValues].map((v) => Number(v) || 0).filter((v) => v > 0),
        links: sanitizeLinks(links),
      };

      const profileFile = new File([JSON.stringify(profileJson)], "profile.json", { type: "application/json" });
      const formData = new FormData();
      formData.append("file", profileFile);

      const response = await fetch(`${httpBase()}store`, {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      if (!response.ok) throw new Error(`Profile upload failed: ${response.status}`);
      const result = await response.json();
      const newProfileCid = result?.cid;
      if (!newProfileCid) throw new Error("API did not return a CID for the profile.");

      await sendAsActor(app, {
        contractName: "UserProfile",
        functionName: "setString",
        args: [toHexBytes32(app.selectedDomainName()), toHexBytes32("profile_cid"), newProfileCid],
      });

      // ⚙️ Update caches ONLY if actor==auth user AND subject==auth user.
      await applyProfileEditResult(app, {
        ownerAddress: profileData()?.address,          // subject we just edited
        oldCid: profileCid(),
        newCid: newProfileCid,
        profileJson,
        actorAddress: getActorAddress(app),            // enforce actor==auth user for self-update
        ensureAuthRefresh: true,
      });

      pushToast({ type: "success", message: t("profile.edit.saveSuccess") });
      refetch();
    } catch (err) {
      pushErrorToast(err, { context: t("profile.edit.saveError") });
    } finally {
      setIsSaving(false);
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
              <div class="flex justify-center items-center h-48">
                <Spinner />
              </div>
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
                        <label htmlFor="registered-name" class="font-medium">
                          {t("profile.edit.registeredName")}
                        </label>
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

                  {/* Subsection: Reading Key */}
                  <Show when={isSelfActorEditingSelf()}>
                    <div class="pt-6 border-t border-[hsl(var(--border))]">
                      <h4 class="text-md font-semibold mb-2">{t("profile.edit.readingKey.title")}</h4>
                      <p class="text-sm text-[hsl(var(--muted-foreground))] mb-4">
                        {t("profile.edit.readingKey.description")}
                      </p>

                      <Show when={isLoadingReadingKey()}>
                        <div class="flex items-center gap-2 text-sm text-[hsl(var(--muted-foreground))]">
                          <Spinner class="w-4 h-4" />
                          <span>{t("profile.edit.readingKey.loading")}</span>
                        </div>
                      </Show>

                      <Show when={!isLoadingReadingKey()}>
                        <Show
                          when={readingKey()}
                          fallback={
                            <button
                              class="px-4 py-2 text-sm rounded bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90 disabled:opacity-60"
                              onClick={handleGenerateReadingKey}
                              disabled={isGeneratingReadingKey()}
                            >
                              <Show when={isGeneratingReadingKey()} fallback={t("profile.edit.readingKey.generateButton")}>
                                <div class="flex items-center gap-2">
                                  <Spinner class="w-4 h-4" />
                                  <span>{t("profile.edit.readingKey.generating")}</span>
                                </div>
                              </Show>
                            </button>
                          }
                        >
                          <div class="space-y-3">
                            <div class="bg-[hsl(var(--muted))] p-3 rounded text-xs font-mono space-y-2">
                              <div>
                                <span class="text-[hsl(var(--muted-foreground))]">Public Key: </span>
                                <span class="break-all">{readingKey()?.publicKey}</span>
                              </div>
                              <div>
                                <span class="text-[hsl(var(--muted-foreground))]">Scheme: </span>
                                <span>{readingKey()?.scheme}</span>
                              </div>
                              <div>
                                <span class="text-[hsl(var(--muted-foreground))]">Nonce: </span>
                                <span class="break-all">{readingKey()?.nonce}</span>
                              </div>
                            </div>
                            <button
                              class="px-4 py-2 text-sm rounded bg-[hsl(var(--secondary))] text-[hsl(var(--secondary-foreground))] hover:opacity-90 disabled:opacity-60"
                              onClick={handleGenerateReadingKey}
                              disabled={isGeneratingReadingKey()}
                            >
                              <Show when={isGeneratingReadingKey()} fallback={t("profile.edit.readingKey.renewButton")}>
                                <div class="flex items-center gap-2">
                                  <Spinner class="w-4 h-4" />
                                  <span>{t("profile.edit.readingKey.renewing")}</span>
                                </div>
                              </Show>
                            </button>
                          </div>
                        </Show>

                        {/* Stored Keys Info */}
                        <div class="mt-4 pt-4 border-t border-[hsl(var(--border))]">
                          <div class="flex items-center justify-between">
                            <div class="text-sm">
                              <span class="text-[hsl(var(--muted-foreground))]">
                                {t("readingKey.store.keysStored")}:{" "}
                              </span>
                              <span class="font-medium">{storedKeysCount()}</span>
                            </div>
                            <Show when={storedKeysCount() > 0}>
                              <button
                                onClick={handleDeleteStoredKeys}
                                class="px-3 py-1 text-xs rounded bg-[hsl(var(--destructive))] text-[hsl(var(--destructive-foreground))] hover:opacity-90"
                              >
                                {t("readingKey.store.deleteButton")}
                              </button>
                            </Show>
                          </div>
                          <Show when={storedKeysCount() > 0}>
                            <p class="text-xs text-[hsl(var(--muted-foreground))] mt-2">
                              {t("readingKey.store.storedInfo")}
                            </p>
                          </Show>
                        </div>
                      </Show>
                    </div>
                  </Show>
                </div>

                {/* Section 2: Domain Specific Parameters */}
                <div class="relative p-4 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] space-y-4">
                  <Show when={app.authorizedUser()?.isAdmin && contextMenuItems().length > 0}>
                    <ContextMenu items={contextMenuItems()} positionClass="absolute top-2 right-2 z-20" />
                  </Show>

                  <h3 class="text-lg font-semibold">{t("profile.edit.domainSpecificParams")}</h3>
                  <p class="text-sm text-[hsl(var(--muted-foreground))]">
                    {t("profile.edit.domainLabel")}: <strong>{app.selectedDomainName()}</strong>
                  </p>

                  <div class="relative mt-4 pt-8 p-3 border rounded-lg border-[hsl(var(--border))]">
                    <div class="absolute top-2 right-2">
                      <LangSelector codes={domainLangCodes()} value={activeLang()} onChange={setActiveLang} />
                    </div>
                    <div class="space-y-4">
                      <div>
                        <label htmlFor="display-name-lang" class="font-medium text-sm">
                          {t("profile.edit.displayName")}
                        </label>
                        <input
                          id="display-name-lang"
                          type="text"
                          value={displayNames[activeLang()] || ""}
                          onInput={handleDisplayNameChange}
                          class="w-full px-3 py-2 rounded border bg-[hsl(var(--background))] text-[hsl(var(--foreground))] border-[hsl(var(--input))] mt-1"
                        />
                      </div>
                      <div>
                        <label class="font-medium text-sm">{t("profile.edit.aboutMe")}</label>
                        <textarea
                          value={about[activeLang()] || ""}
                          onInput={handleAboutChange}
                          class="mt-1 w-full min-h-[120px] p-2 rounded border bg-[hsl(var(--background))] text-[hsl(var(--foreground))] border-[hsl(var(--input))]"
                          placeholder="Tell us about yourself..."
                        />
                      </div>
                    </div>
                  </div>

                  <div class="pt-4 border-t border-[hsl(var(--border))]">
                    <LinksEditor value={links} onChange={(next) => setLinks(reconcile(next || []))} />
                  </div>

                  <div class="pt-4 border-t border-[hsl(var(--border))] grid grid-cols-[12rem_1fr] items-center gap-x-4 gap-y-3">
                    <label htmlFor="nsfw-preference" class="font-medium justify-self-end">
                      {t("profile.edit.nsfw.label")}
                    </label>
                    <select
                      id="nsfw-preference"
                      value={nsfwPreference()}
                      onChange={(e) => setNsfwPreference(e.currentTarget.value)}
                      class="w-full max-w-sm px-3 py-2 rounded border bg-[hsl(var(--background))] text-[hsl(var(--foreground))] border-[hsl(var(--input))]"
                    >
                      <option value="s">{t("profile.edit.nsfw.show")}</option>
                      <option value="w">{t("profile.edit.nsfw.warn")}</option>
                      <option value="h">{t("profile.edit.nsfw.hide")}</option>
                    </select>

                    <label class="font-medium justify-self-end self-start pt-2">
                      {t("profile.edit.sponsorValues.label")}
                    </label>
                    <div class="flex items-center gap-2">
                      <For each={sponsorValues}>
                        {(value, index) => (
                          <input
                            type="number"
                            value={value}
                            onInput={(e) => handleSponsorValueChange(index(), e.currentTarget.value)}
                            class="w-full px-2 py-1 text-center rounded border bg-[hsl(var(--background))] text-[hsl(var(--foreground))] border-[hsl(var(--input))]"
                          />
                        )}
                      </For>
                    </div>
                  </div>
                </div>

                <div class="flex justify-end">
                  <button
                    class="px-6 py-3 text-lg rounded-lg bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] font-bold hover:opacity-90 disabled:opacity-60"
                    onClick={handleSave}
                    disabled={isSaving()}
                  >
                    <Show when={isSaving()} fallback={t("profile.edit.saveButton")}>
                      <div class="flex items-center gap-2">
                        <Spinner class="w-5 h-5" />
                        <span>{t("profile.edit.saving")}</span>
                      </div>
                    </Show>
                  </button>
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
      <StoreReadingKeyModal
        isOpen={showStoreKeyModal()}
        onClose={handleDeclineStoreKey}
        onConfirm={handleConfirmStoreKey}
      />
    </>
  );
}
