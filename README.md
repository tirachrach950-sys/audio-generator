# Voxwright

One page (`index.html`) + two tiny functions (`/api/verify`, `/api/config`) for the Gumroad unlock.
Voices come from the visitor's device (Web Speech API): no audio server, no packages.

Launch: import in Vercel (Framework: Other), no token needed. Make sure the Gumroad product has "Generate a unique license key per sale" turned on, then redeploy.
Check `/health` -> ok and `/config` -> `"payments_ready":true`.
Pro unlock = the e-mail used at Gumroad checkout.

