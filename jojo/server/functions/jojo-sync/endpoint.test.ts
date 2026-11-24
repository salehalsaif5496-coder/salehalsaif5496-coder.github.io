import assert from "node:assert";
import { allowedEndpoint } from "./endpoint.ts";
Deno.test("push endpoint allowlist", () => {
  for (const ok of ["https://web.push.apple.com/QOxx", "https://fcm.googleapis.com/fcm/send/abc", "https://updates.push.services.mozilla.com/wpush/v2/x", "https://wns2-par02p.notify.windows.com/w/?token=1"])
    assert.strictEqual(allowedEndpoint(ok), true, ok);
  for (const bad of ["http://fcm.googleapis.com/x", "https://evil.example/x", "https://fcm.googleapis.com.evil.io/x", "https://169.254.169.254/latest", "https://fcm.googleapis.com:8443/x", "not a url"])
    assert.strictEqual(allowedEndpoint(bad), false, bad);
});
