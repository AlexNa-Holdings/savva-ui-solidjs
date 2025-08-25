// src/blockchain/auth.js
import { hexToString } from "viem";
import { getSavvaContract } from "./contracts.js";
import { toHexBytes32, toChecksumAddress } from "./utils.js";
import { walletAccount } from "./wallet.js";
import { httpBase } from "../net/endpoints.js";

export async function authorize(app) {
  const account = walletAccount();
  if (!account) throw new Error("Wallet is not connected.");
  const checksummedAccount = toChecksumAddress(account);

  const info = app.info();
  if (!info) throw new Error("Backend /info not loaded yet.");

  const userProfileContract = await getSavvaContract(app, 'UserProfile');
  const domainHex = toHexBytes32("");
  const keyHex = toHexBytes32("auth_modifier");
  const modifierHex = await userProfileContract.read.getString([account, domainHex, keyHex]);
  const modifierString = hexToString(modifierHex, { size: 32 });
  
  const textToSign = info.auth_text_to_sign;
  if (!textToSign) throw new Error("auth_text_to_sign not found in /info response.");

  const messageToSign = textToSign + modifierString;
  
  const walletClient = app.getGuardedWalletClient();
  const signature = await walletClient.signMessage({ account, message: messageToSign });
  
  const currentDomain = app.config().domain;
  
  const authUrl = new URL(`${httpBase()}auth`);
  authUrl.searchParams.set('user_addr', checksummedAccount);
  authUrl.searchParams.set('domain', currentDomain);
  authUrl.searchParams.set('signature', signature);
  
  const authRes = await fetch(authUrl.toString(), { credentials: 'include' });
  if (!authRes.ok) throw new Error(`Authorization failed with status: ${authRes.status}`);

  const isAdminUrl = new URL(`${httpBase()}is-admin`);
  isAdminUrl.searchParams.set('address', checksummedAccount);
  isAdminUrl.searchParams.set('domain', currentDomain);
  
  const adminRes = await fetch(isAdminUrl.toString(), { credentials: 'include' });
  if (!adminRes.ok) throw new Error(`/is-admin check failed with status: ${adminRes.status}`);
  const isAdminData = await adminRes.json();
  
  const isAdmin = !!isAdminData?.admin;

  const coreUserData = {
    address: account,
    domain: currentDomain,
    isAdmin: isAdmin,
  };
  
  await app.login(coreUserData);
  
  return coreUserData;
}