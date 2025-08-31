// src/pages/ProfilePage.jsx
import { createMemo, createResource, createSignal, Show, Switch, Match } from "solid-js";
import { useApp } from "../context/AppContext.jsx";
import { useHashRouter } from "../routing/hashRouter.js";
import ClosePageButton from "../components/ui/ClosePageButton.jsx";
import Spinner from "../components/ui/Spinner.jsx";
import IpfsImage from "../components/ui/IpfsImage.jsx";
import UnknownUserIcon from "../components/ui/icons/UnknownUserIcon.jsx";
import StakerLevelIcon from "../components/ui/StakerLevelIcon.jsx";
import VerifiedBadge from "../components/ui/icons/VerifiedBadge.jsx";
import Tabs from "../components/ui/Tabs.jsx";
import { formatRewardAmount } from "../blockchain/utils.js";
import Address from "../components/ui/Address.jsx";
import { formatUnits } from "viem";
import { ipfs } from "../ipfs/index.js";
import { PostsIcon, SubscribersIcon, SubscriptionsIcon, WalletIcon } from "../components/ui/icons/ProfileIcons.jsx";
import PostsTab from "../components/profile/PostsTab.jsx";
import SubscribersTab from "../components/profile/SubscribersTab.jsx";
import TokenValue from "../components/ui/TokenValue.jsx";

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
  
  const TABS = createMemo(() => [
    { id: 'posts', label: t("profile.tabs.posts"), icon: <PostsIcon /> },
    { id: 'subscribers', label: t("profile.tabs.subscribers"), icon: <SubscribersIcon /> },
    { id: 'subscriptions', label: t("profile.tabs.subscriptions"), icon: <SubscriptionsIcon /> },
    { id: 'wallet', label: t("profile.tabs.wallet"), icon: <WalletIcon /> }
  ]);
  
  const aboutText = createMemo(() => {
    const details = profileDetails();
    if (!details || !details.about) return "";

    const aboutData = details.about;
    if (typeof aboutData === 'string') {
      return aboutData;
    }
    if (typeof aboutData === 'object') {
      const lang = app.lang();
      return aboutData[lang] || aboutData.en || Object.values(aboutData)[0] || "";
    }
    return "";
  });

  const Stat = (props) => (
    <div class="text-center">
      <div class="font-bold text-lg">{props.value}</div>
      <div class="text-xs text-[hsl(var(--muted-foreground))]">{props.label}</div>
    </div>
  );

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
              <div class="flex flex-col sm:flex-row items-center sm:items-start gap-6">
                <div class="w-48 h-48 sm:w-56 sm:h-56 rounded-2xl overflow-hidden shrink-0 bg-[hsl(var(--muted))] border-2 border-[hsl(var(--border))]">
                  <IpfsImage 
                    src={user().avatar}
                    alt={`${user().name} avatar`}
                    class="w-full h-full object-cover"
                    fallback={<UnknownUserIcon class="w-full h-full text-[hsl(var(--muted-foreground))]" />}
                  />
                </div>
                <div class="flex-1 w-full text-center sm:text-left space-y-3">
                  <div class="flex flex-col items-center sm:items-start">
                    <h2 class="text-2xl font-bold">{user().display_name || user().name}</h2>
                    <Show when={user().name}>
                      <div class="flex items-center gap-1 text-sm text-[hsl(var(--muted-foreground))]">
                        <span>{user().name}</span>
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
                    </div>
                    <div class="flex items-center gap-2 mt-1 text-sm">
                      <span class="text-[hsl(var(--muted-foreground))]">{t("profile.stats.receivedFromSubscribers")}:</span>
                      <TokenValue amount={user().total_sponsored} />
                    </div>
                  </div>

                  <Show when={aboutText()}>
                    <p class="text-sm pt-2 text-[hsl(var(--foreground))]">{aboutText()}</p>
                  </Show>
                  
                  <div class="flex justify-center sm:justify-start items-center gap-4 flex-wrap pt-2">
                    <Stat value={user().n_followers} label={t("profile.stats.subscribers")} />
                    <Stat value={user().n_following} label={t("profile.stats.subscriptions")} />
                    <Stat value={user().n_sponsoring} label={t("profile.stats.sponsoring")} />
                    <Stat value={user().n_nfts} label={t("profile.stats.nfts")} />
                    <div class="ml-auto">
                      <button class="px-4 py-2 rounded-md bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] font-semibold">
                        {t("profile.subscribe")}
                      </button>
                    </div>
                  </div>
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
                      <p class="text-center text-sm text-[hsl(var(--muted-foreground))]">Subscriptions list will be implemented here.</p>
                    </Match>
                    <Match when={activeTab() === 'wallet'}>
                      <p class="text-center text-sm text-[hsl(var(--muted-foreground))]">Wallet/Assets view will be implemented here.</p>
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



