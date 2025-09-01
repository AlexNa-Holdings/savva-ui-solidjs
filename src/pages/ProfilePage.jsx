// src/pages/ProfilePage.jsx
import { createMemo, createResource, createSignal, Show, Switch, Match, createEffect, onCleanup, onMount } from "solid-js";
import { useApp } from "../context/AppContext.jsx";
import { useHashRouter, navigate } from "../routing/hashRouter.js";
import ClosePageButton from "../components/ui/ClosePageButton.jsx";
import Spinner from "../components/ui/Spinner.jsx";
import IpfsImage from "../components/ui/IpfsImage.jsx";
import UnknownUserIcon from "../components/ui/icons/UnknownUserIcon.jsx";
import StakerLevelIcon from "../components/ui/StakerLevelIcon.jsx";
import VerifiedBadge from "../components/ui/icons/VerifiedBadge.jsx";
import Tabs from "../components/ui/Tabs.jsx";
import Address from "../components/ui/Address.jsx";
import { ipfs } from "../ipfs/index.js";
import { PostsIcon, SubscribersIcon, SubscriptionsIcon, WalletIcon } from "../components/ui/icons/ProfileIcons.jsx";
import PostsTab from "../components/profile/PostsTab.jsx";
import SubscribersTab from "../components/profile/SubscribersTab.jsx";
import SubscriptionsTab from "../components/profile/SubscriptionsTab.jsx";
import WalletTab from "../components/profile/WalletTab.jsx";
import TokenValue from "../components/ui/TokenValue.jsx";
import { walletAccount } from "../blockchain/wallet.js";

// Data fetcher for the user profile
async function fetchUserProfile({ app, identifier }) {
  if (!identifier || !app.wsCall) return null;

  try {
    const wsParams = { domain: app.selectedDomainName() };
    const currentUser = app.authorizedUser();
    if (currentUser) {
      wsParams.caller = currentUser.address;
    }

    if (identifier.startsWith('@')) {
      wsParams.user_name = identifier.substring(1);
    } else {
      wsParams.user_addr = identifier;
    }

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
    return path.startsWith('/') ? path.substring(1) : path;
  });

  const [userResource] = createResource(() => ({ app, identifier: identifier() }), fetchUserProfile);
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
    ];

    if (isMyProfile()) {
      tabs.push({ id: 'wallet', label: t("profile.tabs.wallet"), icon: <WalletIcon /> });
    }

    return tabs;
  });

  createEffect(() => {
    const availableTabs = TABS();
    const currentActive = activeTab();
    if (!availableTabs.some(tab => tab.id === currentActive)) {
      setActiveTab('posts');
    }
  });

  // ---- locale-aware display name with live alert updates (no global changes needed) ----
  const uiLang = () => (app.lang?.() || "en").toLowerCase();
  const [overlayNames, setOverlayNames] = createSignal(null);

  // Subscribe to any user profile/update alert and apply display_names if it matches this page's user.
  onMount(() => {
    const off = app.alertBus?.on?.("*", ({ type, payload }) => {
      try {
        const d = payload?.data || {};
        const addr = String(d.user?.address || d.address || "").toLowerCase();
        const pageAddr = String(userResource()?.address || "").toLowerCase();
        const names = d.display_names || d.user?.display_names;
        if (addr && names && addr === pageAddr) {
          setOverlayNames(names);
        }
      } catch {
        /* ignore */
      }
    });
    onCleanup(() => { try { off && off(); } catch {} });
  });

  const displayName = createMemo(() => {
    const u = userResource();
    if (!u) return "";
    const namesFromAlert = overlayNames();
    if (namesFromAlert && typeof namesFromAlert === "object") {
      const n = namesFromAlert[uiLang()];
      if (n) return n;
    }
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

  const isSubscribed = createMemo(() => {
    const u = userResource();
    return u && u.i_sponsor_for > 0;
  });

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
              {/* Profile Header */}
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
                          <button class="w-full px-4 py-2 rounded-md bg-[hsl(var(--secondary))] text-[hsl(var(--secondary-foreground))]">
                            {t("profile.unsubscribe")}
                          </button>
                        }
                      >
                        <button class="w-full px-4 py-2 rounded-md bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] font-semibold">
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
                          <span>{user().name.toUpperCase()}</span>
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

              {/* Profile Tabs */}
              <div>
                <Tabs items={TABS()} value={activeTab()} onChange={setActiveTab} compactWidth={640} />
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
            </div>
          }
        </Match>
      </Switch>
    </main>
  );
}
