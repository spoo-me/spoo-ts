---
"spoo.me": minor
---

What the first-party ports needed: auth.me() (works with API keys and app
tokens), an invalidate() handle on tokenProvider for retry-on-401, and
authorizationUrl accepting a registered-default redirect (redirectUri now
optional).
