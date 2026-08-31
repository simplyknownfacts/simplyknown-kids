# DNS rollback card — kids.simplyknown.co

Recorded 2026-08-31, before the Cloudflare Pages cutover. **This is the undo.**

## The record as it stands today (GitHub Pages)

```json
{
  "id": "3fedb9609a9255bbe82d16e5ca186675",
  "type": "CNAME",
  "name": "kids.simplyknown.co",
  "content": "simplyknownfacts.github.io",
  "proxied": false,
  "ttl": 1
}
```

Zone `simplyknown.co` = `c2122c26b90877a0ec8708f67827e203`.

## To put it back

If the live site misbehaves after the cutover, this restores GitHub Pages. It takes
effect within a minute or two, and GitHub Pages stays running throughout the soak, so
there is always something to fall back to.

```bash
cd "C:/Users/HomeSeer/OneDrive/Documents/Claude/Projects/Kids_App"
export CLOUDFLARE_API_TOKEN="$(tr -d '\r\n' < secrets/cf_api_token.txt)"
curl -s -X PATCH \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" -H "Content-Type: application/json" \
  --data '{"type":"CNAME","name":"kids","content":"simplyknownfacts.github.io","proxied":false}' \
  "https://api.cloudflare.com/client/v4/zones/c2122c26b90877a0ec8708f67827e203/dns_records/3fedb9609a9255bbe82d16e5ca186675"
```

Then confirm it is back:

```bash
curl -sI https://kids.simplyknown.co/ | grep -i "^server:"
```

Expected: `Server: GitHub.com`.

## To go forward instead (the cutover)

Not done yet, on purpose: the step immediately after it is checking the site on the
tablet that already has the app installed, and that needs a person holding the tablet.

```bash
cd "C:/Users/HomeSeer/OneDrive/Documents/Claude/Projects/Kids_App"
export CLOUDFLARE_API_TOKEN="$(tr -d '\r\n' < secrets/cf_api_token.txt)"
curl -s -X POST -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" -H "Content-Type: application/json" \
  --data '{"name":"kids.simplyknown.co"}' \
  "https://api.cloudflare.com/client/v4/accounts/800641c6f1cf4d042c8ed396c6d901a1/pages/projects/simplyknown-kids/domains"
curl -s -X PATCH -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" -H "Content-Type: application/json" \
  --data '{"type":"CNAME","name":"kids","content":"simplyknown-kids.pages.dev","proxied":true}' \
  "https://api.cloudflare.com/client/v4/zones/c2122c26b90877a0ec8708f67827e203/dns_records/3fedb9609a9255bbe82d16e5ca186675"
```

Then: `curl -sI https://kids.simplyknown.co/ | grep -i "^server:"` should say `cloudflare`,
and the site should open normally on a real tablet before anyone calls it done.

## State at the time of writing

| Address | Serving | Gated |
|---|---|---|
| `kids.simplyknown.co` | GitHub Pages | no — public, unchanged |
| `simplyknown-kids.pages.dev` | Cloudflare Pages, current code | no — not yet gated |
| `kids1.simplyknown.co` | Cloudflare Pages (dev) | yes — redirects to login |
| `simplyknown-kids1.pages.dev` | Cloudflare Pages (dev) | yes — redirects to login |

Production is gated, and the repository is made private, only in the final step of the
migration plan — after a soak and Scott's explicit go. Both are one-way.
