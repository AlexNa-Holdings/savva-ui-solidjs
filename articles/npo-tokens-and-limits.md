# NPO Treasury Controls: Supported Tokens and Weekly Spending Limits

Savva NPO accounts let a group of people act on the platform under a shared on-chain identity, pooling funds, posting together, holding NFTs, running campaigns. Until now, the controls a community had over its NPO were mostly about who is a member and what roles they could take. With the latest update, NPO admins also get explicit control over what tokens the treasury supports and how much each member can spend per week.

## Why this matters

An NPO is a smart contract that holds tokens. Anything its members do on-chain — buying announcements, contributing to fundraisers, subscribing on behalf of the org, making swaps — moves tokens out of that contract. Without per-token, per-member ceilings, a single member could drain the treasury, intentionally or by mistake, before the rest of the team noticed.

Two new pieces solve this: an admin-curated list of ERC-20 tokens the NPO works with, and per-member weekly spending limits on each of those tokens. Together they turn an NPO from a shared wallet into a governed shared wallet.

## The Tokens tab

Open any NPO page and you will find a new Tokens tab next to Users and Roles.

Admins see a table of currently supported tokens with their symbol, decimals, and contract address, plus two actions. Add token opens a dialog where you paste an ERC-20 contract address. The dialog reads the token's symbol and decimals directly from the chain so you can confirm you have pasted the right contract before signing. Remove is per-row, with a confirmation prompt.

Everyone else sees the same list, read-only. This is intentional, since knowing which tokens the NPO supports is part of understanding what the org can do.

Being supported means two things on chain. First, only supported tokens can be approved by non-admin members through the NPO multicall path; an attempt to approve any other token reverts. Second, supported tokens are the ones whose per-member weekly spend is tracked and enforced. So if a member needs to subscribe an author, contribute to a fundraiser, or run any operation that pulls a specific ERC-20 from the NPO, that token has to be on the list first.

## Weekly Spending Limits

The Users tab has always shown each member's roles. It now also shows a Token Limits column with one chip per supported token, formatted as spent over limit. The numbers are in human units; the UI applies each token's decimals automatically. The spent side resets every week, since the contract uses a fixed seven-day window keyed off block timestamp. The limit side stays put until an admin changes it.

Admins see a small edit icon next to the chips. Clicking it opens a dialog with one row per supported token, showing the symbol, the current week's spent value, and an editable limit. The input is the platform's standard amount control: it understands the token's decimals, accepts decimals or commas, and shows a live USD estimate next to the value. Changing a limit and pressing Save sends one on-chain transaction per modified row.

Admins themselves are not limited. The contract's multicall recognizes admin members at execution time and bypasses the balance snapshots, the per-call allowance gating, and the post-call spend enforcement. The Token Limits cell reflects this: an admin row simply reads "no limits" and the edit icon is hidden. This is by design, since admins are the ones authorizing spending in the first place and are not the threat model the limits are protecting against.

If a member's transaction would push their weekly spent past their limit for any token, the whole multicall reverts. Nothing partial: either the entire batch of operations succeeds within budget, or none of it lands on chain. A member who hits the cap mid-week has two options: wait for the next week's rollover, or ask an admin to raise their limit.

## How a typical setup looks

For a media collective that pays authors in SAVVA and occasionally promotes posts, an admin might open the Tokens tab and add the SAVVA token contract along with whatever else the team plans to spend. Then on the Users tab, for each contributor, click the edit icon on Token Limits and set a weekly budget that matches that person's editorial role — say, five thousand SAVVA for the editor in chief, a thousand for guest writers. Promote one or two trusted people to admin so any limit caps can be raised quickly when needed.

From that point on, members do their work as usual — subscribing to authors they cover, contributing to community fundraisers, and so on — and the NPO automatically polices the totals. Mistakes and bad actors hit a wall; honest day-to-day activity sails through.

## Things to know before you start

Adding a token, removing a token, and editing any member's limit are all admin-only actions. Non-admins still see the data; they just cannot change it.

Removing a token does not refund or reset stored limits. It just takes the token out of the supported set. If you re-add it later, members' previous limits and weekly spent values are still there.

Limits are per token. Setting a member's SAVVA limit to zero does not restrict them on other tokens.

Limits are weekly, not monthly or per-transaction. The week is a fixed seven-day grid based on block timestamp, identical for every member of the NPO. The spent counter is reset lazily: the next time the member makes a multicall, if a new week has started, all of their weekly spend slots are zeroed before the new transaction is checked.

Approvals inside an NPO multicall are auto-revoked at the end of every transaction for non-admin members. The UI's subscription and contribution flows now bundle the approve and the spending call into a single multicall, so no separate approval transaction is needed. This is a UI detail, not something to manage manually.

## What's next

These controls are the foundation for richer treasury policies: daily caps, per-counterparty limits, role-scoped budgets. The contract storage already separates limit from spent per token per member, which makes adding new dimensions cheap. If your NPO has specific governance needs, let us know in the community channels; these features tend to get built when there is a real organization asking for them.

Until then, head to your NPO's Tokens tab, add what you need, and set sensible weekly limits on the Users tab. Treasury hygiene is now a first-class part of running an NPO on Savva.
