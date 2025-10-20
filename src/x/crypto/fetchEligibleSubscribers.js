// src/x/crypto/fetchEligibleSubscribers.js

import { fetchReadingKey } from "./readingKey.js";

/**
 * Fetch all eligible subscribers with their reading keys
 *
 * @param {object} app - Application context
 * @param {string} authorAddress - Author's address
 * @param {BigInt} minWeeklyPaymentWei - Minimum weekly payment in wei (optional)
 * @returns {Promise<Array<object>>} - Array of { address, publicKey, scheme, nonce, amount, weeks }
 */
export async function fetchEligibleSubscribers(app, authorAddress, minWeeklyPaymentWei = 0n) {
  console.log(`[fetchEligibleSubscribers] Starting fetch for ${authorAddress}`, {
    hasWsMethod: !!app.wsMethod,
    hasAuthorAddress: !!authorAddress,
    minWeeklyPaymentWei: minWeeklyPaymentWei.toString(),
    appKeys: Object.keys(app)
  });

  if (!app.wsMethod || !authorAddress) {
    throw new Error("Missing app.wsMethod or authorAddress");
  }

  // Get current domain name
  const currentDomain = app.selectedDomainName?.() || "";
  console.log(`[fetchEligibleSubscribers] Using domain: ${currentDomain}`);

  // Fetch all subscribers for the current domain
  console.log(`[fetchEligibleSubscribers] Calling app.wsMethod("get-sponsors")...`);
  const getSponsors = app.wsMethod("get-sponsors");
  console.log(`[fetchEligibleSubscribers] wsMethod returned:`, typeof getSponsors, getSponsors);

  const params = {
    domain: currentDomain,
    user_addr: authorAddress,
    n_weeks: 0,
    limit: 1000,
    offset: 0,
  };
  console.log(`[fetchEligibleSubscribers] About to call getSponsors with params:`, params);

  console.log(`[fetchEligibleSubscribers] Calling getSponsors()...`);
  const res = await getSponsors(params);

  console.log(`[fetchEligibleSubscribers] Got response from get-sponsors:`, res);

  const sponsors = Array.isArray(res?.sponsors) ? res.sponsors : [];
  console.log(`[fetchEligibleSubscribers] Total sponsors: ${sponsors.length}`, sponsors);
  if (sponsors.length > 0) {
    console.log(`[fetchEligibleSubscribers] First sponsor structure:`, JSON.stringify(sponsors[0], null, 2));
  }

  // Filter eligible subscribers (weeks > 0 and amount >= minimum and not banned)
  const eligible = sponsors.filter(s => {
    const weeks = Number(s.weeks || 0);
    const amount = BigInt(s.amount || 0);
    const userAddress = s.user?.address || s.user_addr;
    const isBanned = s.user?.banned || false;
    const isEligible = weeks > 0 && amount >= minWeeklyPaymentWei && !isBanned;
    console.log(`[fetchEligibleSubscribers] Checking ${userAddress}: weeks=${weeks}, amount=${amount}, minRequired=${minWeeklyPaymentWei}, banned=${isBanned}, eligible=${isEligible}`);
    return isEligible;
  });

  console.log(`[fetchEligibleSubscribers] Eligible subscribers after filtering: ${eligible.length}`);

  // Fetch reading keys for all eligible subscribers
  const subscribersWithKeys = await Promise.all(
    eligible.map(async (subscriber) => {
      try {
        const userAddress = subscriber.user?.address || subscriber.user_addr;
        console.log(`[fetchEligibleSubscribers] Fetching reading key for ${userAddress}`);
        const readingKey = await fetchReadingKey(app, userAddress);
        console.log(`[fetchEligibleSubscribers] Reading key result for ${userAddress}:`, readingKey);

        if (!readingKey || !readingKey.publicKey) {
          console.warn(`[fetchEligibleSubscribers] Subscriber ${userAddress} has no reading key`);
          return null;
        }

        return {
          address: userAddress,
          publicKey: readingKey.publicKey,
          scheme: readingKey.scheme,
          nonce: readingKey.nonce,
          amount: subscriber.amount,
          weeks: subscriber.weeks,
        };
      } catch (error) {
        console.error(`Failed to fetch reading key for ${subscriber.user_addr}:`, error);
        return null;
      }
    })
  );

  // Filter out subscribers without reading keys
  const validSubscribers = subscribersWithKeys.filter(s => s !== null);

  console.log(`Eligible subscribers: ${eligible.length}, with reading keys: ${validSubscribers.length}`);

  return validSubscribers;
}
