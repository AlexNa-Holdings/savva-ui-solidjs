// src/pages/ProfilePage.jsx
import { createMemo, createResource, createSignal, Show, Switch, Match, createEffect } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";
import { useHashRouter, navigate } from "../../routing/hashRouter.js";
import ClosePageButton from "../ui/ClosePageButton.jsx";
import Spinner from "../ui/Spinner.jsx";
import IpfsImage from "../ui/IpfsImage.jsx";
import UnknownUserIcon from "../ui/icons/UnknownUserIcon.jsx";
import StakerLevelIcon from "../ui/StakerLevelIcon.jsx";
import VerifiedBadge from "../ui/icons/VerifiedBadge.jsx";
import Tabs from "../ui/Tabs.jsx";
import Address from "../ui/Address.jsx";
import { ipfs } from "../../ipfs/index.js";
import { PostsIcon, SubscribersIcon, SubscriptionsIcon, WalletIcon } from "../ui/icons/ProfileIcons.jsx";
import PostsTab from "../profile/PostsTab.jsx";
import SubscribersTab from "../profile/SubscribersTab.jsx";
import SubscriptionsTab from "../profile/SubscriptionsTab.jsx";
import WalletTab from "../profile/WalletTab.jsx";
import TokenValue from "../ui/TokenValue.jsx";
import { walletAccount } from "../../blockchain/wallet.js";
import SubscribeModal from "../modals/SubscribeModal.jsx";
import { getSavvaContract } from "../../blockchain/contracts.js";
import { createPublicClient, http } from "viem";

// Data fetcher for the user profile
async function fetchUserProfile({ app, identifier }) {
  if (!identifier || !app.wsCall) return null;
  try {
    const wsParams = { domain: app.selectedDomainName() };
    const currentUser = app.authorizedUser();
    if (currentUser) wsParams.caller = currentUser.address;
    if (identifier.startsWith('@')) wsParams.user_name = identifier.substring(1);
    else wsParams.user_addr = identifier;
    return await app.wsCall('get-user', wsParams);
  } catch (error) {
    console.error("Failed to fetch user profile:", error);
    return { error: error.message };
  }
}

// Data fetcher for the profile details from IPFS
async function fetchProfileDetails(cid, app) {
  if (!cid) return null;
  try {
    const { data } = await ipfs.getJSONBest(app, cid);
    return data;
  } catch (e) {
    console.error(`Failed to fetch profile details from IPFS CID: ${cid}`, e);
    return { error: e.message };
  }
}

export default function ProfilePage() {
  const app = useApp();
  const { t } = app;
  const { route } = useHashRouter();

  const identifier = createMemo(() => {
    const path = route();
    return (path.split('?')[0].split('/')[1] || "");
  });

  const [userResource, { refetch: refetchUser }] = createResource(() => ({ app, identifier: identifier() }), fetchUserProfile);
  const [profileDetails] = createResource(() => userResource()?.profile_cid, (cid) => fetchProfileDetails(cid, app));

  const [activeTab, setActiveTab] = createSignal('posts');

  const isMyProfile = createMemo(() => {
    const authorizedAddr = app.authorizedUser()?.address?.toLowerCase();
    const profileAddr = userResource()?.address?.toLowerCase();
    return !!authorizedAddr && authorizedAddr === profileAddr;
  });

  const canEdit = createMemo(() => {
    const connectedWallet = walletAccount()?.toLowerCase();
    return isMyProfile() && !!connectedWallet && connectedWallet === app.authorizedUser()?.address?.toLowerCase();
  });

  const handleEditProfile = () => {
    navigate(`/profile-edit/${identifier()}`);
  };

  const TABS = createMemo(() => {
    const tabs = [
      { id: 'posts', label: t("profile.tabs.posts"), icon: <PostsIcon /> },
      { id: 'subscribers', label: t("profile.tabs.subscribers"), icon: <SubscribersIcon /> },
      { id: 'subscriptions', label: t("profile.tabs.subscriptions"), icon: <SubscriptionsIcon /> },
      // Wallet is visible for any profile; actions are gated inside WalletTab
      { id: 'wallet', label: t("profile.tabs.wallet"), icon: <WalletIcon /> },
    ];
    return tabs;
  });

  // Read ?tab= from current hash route (reactive to route() changes)
  const desiredTab = createMemo(() => {
    const path = route() || "";
    const qs = path.split("?")[1] || "";
    return new URLSearchParams(qs).get("tab") || "";
  });

  // Apply ?tab= when available and valid; also covers late-appearance of 'wallet'
  createEffect(() => {
    const tab = desiredTab();
    if (!tab) return;
    const valid = TABS().map(t => t.id);
    if (valid.includes(tab)) setActiveTab(tab);
  });

  // Guard: if active tab becomes invalid, fallback to posts
  createEffect(() => {
    const available = TABS();
    if (!available.some(t => t.id === activeTab())) setActiveTab('posts');
  });

  function onTabChange(nextId) {
    const hash = window.location.hash || "";
    const [path, qsRaw] = hash.split("?");
    const params = new URLSearchParams(qsRaw || "");
    params.set("tab", nextId);
    const nextHash = `${path}?${params.toString()}`;
    if (nextHash !== hash) history.replaceState(null, "", nextHash);
    setActiveTab(nextId);
  }

  const uiLang = () => (app.lang?.() || "en").toLowerCase();

  const displayName = createMemo(() => {
    const u = userResource();
    if (!u) return "";
    const addr = String(u.address || "").toLowerCase();
    const overlay = app.userDisplayNames?.()?.[addr]?.[uiLang()];
    if (overlay) return overlay;
    const serverNames = u.display_names;
    if (serverNames && typeof serverNames === "object") {
      const n = serverNames[uiLang()];
      if (n) return n;
    }
    return u.display_name || u.name || "";
  });

  const aboutText = createMemo(() => {
    const details = profileDetails();
    if (!details) return "";
    const lang = app.lang();
    if (details.about_me && typeof details.about_me === 'object') {
      return details.about_me[lang] || details.about_me.en || Object.values(details.about_me)[0] || "";
    }
    if (details.about && typeof details.about === 'string') {
      return details.about;
    }
    return "";
  });

  const [showSub, setShowSub] = createSignal(false);
  const domainName = createMemo(() => app.selectedDomainName?.() || "");

  const isSubscribed = createMemo(() => {
    const u = userResource();
    return u && u.i_sponsor_for > 0;
  });

  async function handleUnsubscribe(authorAddress) {
    try {
      const clubs = await getSavvaContract(app, "AuthorsClubs", { write: true });
      const hash = await clubs.write.stop([domainName(), authorAddress]);
      const pc = createPublicClient({ chain: app.desiredChain(), transport: http(app.desiredChain()?.rpcUrls?.[0]) });
      await pc.waitForTransactionReceipt({ hash });
      await refetchUser();
    } catch (e) {
      console.error("ProfilePage: stop() failed", e);
    }
  }

  function handleSubscribed() {
    setShowSub(false);
    refetchUser();
  }

  return (
    <main class="sv-container p-4 max-w-4xl mx-auto">
      <ClosePageButton />

      <Switch>
        <Match when={userResource.loading}>
          <div class="flex justify-center items-center h-64"><Spinner class="w-8 h-8" /></div>
        </Match>
        <Match when={userResource.error || userResource()?.error}>
          <div class="p-4 rounded border text-center border-[hsl(var(--destructive))] bg-[hsl(var(--card))]">
            <h3 class="font-semibold text-[hsl(var(--destructive))]">{t("profile.error.title")}</h3>
            <p class="text-sm mt-1">{userResource.error?.message || userResource()?.error}</p>
          </div>
        </Match>
        <Match when={userResource()}>
          {(user) =>
            <div class="space-y-6">
              {/* Header */}
              <div class="flex justify-between items-end gap-4">
                <div class="flex flex-col sm:flex-row items-center sm:items-start gap-6">
                  <div class="flex flex-col items-center gap-4 shrink-0">
                    <div class="w-48 h-48 sm:w-56 sm:h-56 rounded-2xl overflow-hidden bg-[hsl(var(--muted))] border-2 border-[hsl(var(--border))]">
                      <IpfsImage
                        src={user().avatar}
                        alt={`${user().name} avatar`}
                        class="w-full h-full object-cover"
                        fallback={<UnknownUserIcon class="w-full h-full text-[hsl(var(--muted-foreground))]" />}
                      />
                    </div>
                    <Show when={app.authorizedUser() && app.authorizedUser().address.toLowerCase() !== user().address.toLowerCase()}>
                      <Show
                        when={!isSubscribed()}
                        fallback={
                          <button
                            class="w-full px-4 py-2 rounded-md bg-[hsl(var(--secondary))] text-[hsl(var(--secondary-foreground))]"
                            onClick={() => handleUnsubscribe(user().address)}
                          >
                            {t("profile.unsubscribe")}
                          </button>
                        }
                      >
                        <button
                          class="w-full px-4 py-2 rounded-md bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] font-semibold"
                          onClick={() => setShowSub(true)}
                        >
                          {t("profile.subscribe")}
                        </button>
                      </Show>
                    </Show>
                  </div>

                  <div class="flex-1 w-full text-center sm:text-left space-y-3">
                    <div class="flex flex-col items-center sm:items-start">
                      <h2 class="text-2xl font-bold">{displayName() || user().name || user().address}</h2>
                      <Show when={user().name}>
                        <div class="flex items-center gap-1 text-sm text-[hsl(var(--muted-foreground))]">
                          <span>{String(user().name || "").toUpperCase()}</span>
                          <VerifiedBadge class="w-4 h-4" />
                        </div>
                      </Show>
                      <div class="mt-1">
                        <Address address={user().address} format="full" />
                      </div>
                      <div class="flex items-center gap-2 mt-2 text-sm">
                        <span class="text-[hsl(var(--muted-foreground))]">{t("profile.stats.staking")}:</span>
                        <TokenValue amount={user().staked} />
                        <StakerLevelIcon staked={user().staked} class="w-5 h-5" />
                      </div>
                      <div class="flex items-center gap-2 mt-1 text-sm">
                        <span class="text-[hsl(var(--muted-foreground))]">{t("profile.stats.paysForSubscriptions")}:</span>
                        <TokenValue amount={user().total_sponsoring} />
                        <span class="text-[hsl(var(--muted-foreground))] text-sm ml-1">{t("profile.stats.perWeek")}</span>
                      </div>
                      <div class="flex items-center gap-2 mt-1 text-sm">
                        <span class="text-[hsl(var(--muted-foreground))]">{t("profile.stats.receivedFromSubscribers")}:</span>
                        <TokenValue amount={user().total_sponsored} />
                        <span class="text-[hsl(var(--muted-foreground))] text-sm ml-1">{t("profile.stats.perWeek")}</span>
                      </div>
                    </div>

                    <Show when={aboutText()}>
                      <p class="text-sm pt-2 text-[hsl(var(--foreground))]">{aboutText()}</p>
                    </Show>
                  </div>
                </div>

                <div class="flex-shrink-0">
                  <Show when={canEdit()}>
                    <button
                      onClick={handleEditProfile}
                      class="px-4 py-2 text-sm rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] hover:bg-[hsl(var(--accent))]"
                      title={t("profile.edit.title")}
                    >
                      {t("profile.edit.buttonLabel")}
                    </button>
                  </Show>
                </div>
              </div>

              {/* Tabs */}
              <div>
                <Tabs items={TABS()} value={activeTab()} onChange={onTabChange} compactWidth={640} />
                <div class="py-4 border-x border-b border-[hsl(var(--border))] rounded-b-lg">
                  <Switch>
                    <Match when={activeTab() === 'posts'}>
                      <PostsTab user={user()} />
                    </Match>
                    <Match when={activeTab() === 'subscribers'}>
                      <SubscribersTab user={user()} />
                    </Match>
                    <Match when={activeTab() === 'subscriptions'}>
                      <SubscriptionsTab user={user()} />
                    </Match>
                    <Match when={activeTab() === 'wallet'}>
                      <WalletTab user={user()} />
                    </Match>
                  </Switch>
                </div>
              </div>

              {/* Subscribe / Edit modal */}
              <Show when={showSub()}>
                <SubscribeModal
                  domain={domainName()}
                  author={user()}
                  onClose={() => setShowSub(false)}
                  onSubmit={handleSubscribed}
                />
              </Show>
            </div>
          }
        </Match>
      </Switch>
    </main>
  );
}
