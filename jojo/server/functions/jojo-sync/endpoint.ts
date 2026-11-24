// خدمات الإشعارات المعروفة فقط (Apple / Google / Mozilla / Microsoft) — ما نرسل لأي عنوان ثاني
const PUSH_HOSTS = [/^web\.push\.apple\.com$/, /^fcm\.googleapis\.com$/, /^android\.googleapis\.com$/,
  /(^|\.)push\.services\.mozilla\.com$/, /(^|\.)notify\.windows\.com$/];
export function allowedEndpoint(endpoint: string) {
  try {
    const u = new URL(endpoint);
    return u.protocol === "https:" && !u.port && PUSH_HOSTS.some((r) => r.test(u.hostname));
  } catch { return false; }
}
