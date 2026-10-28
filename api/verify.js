// GET  /verify                  -> { pro }          (is this browser Pro?)
// POST /verify { key }          -> { valid }        (unlock Pro with the Gumroad license key)
// POST /verify { logout:true }  -> { ok:true }
const A = require('./_lib/auth');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'GET') {
    const s = await A.getSession(req);
    if (s.setCookie) res.setHeader('Set-Cookie', s.setCookie);
    return res.status(200).json({ pro: !!s.pro });
  }
  if (req.method !== 'POST') return res.status(405).json({ valid: false });

  const body = A.readBody(req);
  if (body.logout) {
    res.setHeader('Set-Cookie', A.clearProCookie());
    return res.status(200).json({ ok: true });
  }
  const key = String(body.key || '').trim();
  if (key.length < 8 || key.length > 200) return res.status(200).json({ valid: false, error: 'key' });
  if (A.limited('verify:' + A.clientIp(req), 12, 10 * 60 * 1000)) return res.status(429).json({ valid: false, error: 'busy' });

  try {
    if (!(await A.checkKey(key))) return res.status(200).json({ valid: false, error: 'none' });
    res.setHeader('Set-Cookie', A.proCookie(key));
    return res.status(200).json({ valid: true });
  } catch (e) {
    return res.status(502).json({ valid: false, error: 'busy' });
  }
};
