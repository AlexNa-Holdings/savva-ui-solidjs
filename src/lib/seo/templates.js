// src/lib/seo/templates.js
//
// Title-template builders. Must stay in sync with backend seo templates
// so the bot-rendered title and the SPA-managed title agree.

const join = (parts, sep) => parts.filter(Boolean).join(sep);

export function titlePost(postTitle, author, siteName) {
  const left = author ? `${postTitle} — ${author}` : postTitle;
  return join([left, siteName], " | ");
}

export function titleProfile(displayName, handle, siteName) {
  const left = handle ? `${displayName} (@${handle})` : displayName;
  return join([left, siteName], " | ");
}

export function titleNpo(name, siteName) {
  return join([`${name} — Non-profit`, siteName], " | ");
}

export function titleFundraiser(frTitle, author, siteName) {
  const left = author
    ? `${frTitle} by ${author} — Fundraiser`
    : `${frTitle} — Fundraiser`;
  return join([left, siteName], " | ");
}

export function titleList(listLabel, siteName) {
  return join([listLabel, siteName], " | ");
}
