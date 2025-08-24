// src/context/useAppAuth.js
import { createSignal, onMount } from "solid-js";
import { getWsClient, getWsApi } from "../net/wsRuntime.js";
import { toChecksumAddress } from "../blockchain/utils.js";
import { httpBase } from "../net/endpoints.js";
import { pushErrorToast } from "../components/ui/toast.js";

const AUTH_USER_KEY = "savva_auth_user";

export function useAppAuth() {
  const [authorizedUser, setAuthorizedUser] = createSignal(null);

  onMount(() => {
    try {
      const savedUser = localStorage.getItem(AUTH_USER_KEY);
      if (savedUser) setAuthorizedUser(JSON.parse(savedUser));
    } catch (e) {
      console.error("Failed to load authorized user:", e);
      localStorage.removeItem(AUTH_USER_KEY);
    }
  });

  async function login(coreUserData) {
    if (!coreUserData || !coreUserData.address) return;
    setAuthorizedUser(coreUserData);
    try {
      localStorage.setItem(AUTH_USER_KEY, JSON.stringify(coreUserData));
      const checksummedAccount = toChecksumAddress(coreUserData.address);
      const userProfile = await getWsApi().call('get-user', {
        domain: coreUserData.domain,
        user_addr: checksummedAccount,
      });
      const fullUserData = { ...coreUserData, ...userProfile };
      setAuthorizedUser(fullUserData);
      localStorage.setItem(AUTH_USER_KEY, JSON.stringify(fullUserData));
    } catch (e) {
      console.error("Failed to fetch/save user profile after login:", e);
      pushErrorToast(e, { context: "Profile fetch failed" });
    }
  }

  async function logout() {
    try {
      await fetch(`${httpBase()}logout`, { method: 'POST', credentials: 'include' });
    } catch (e) {
      console.error("Logout API call failed, proceeding with client-side logout.", e);
    }
    setAuthorizedUser(null);
    try {
      localStorage.removeItem(AUTH_USER_KEY);
    } catch (e) {
      console.error("Failed to clear authorized user:", e);
    }
    getWsClient()?.reconnect('user-logged-out');
  }

  function handleAuthError() {
    console.warn("Authorization error detected, logging out.");
    logout();
  }

  return { authorizedUser, login, logout, handleAuthError };
}