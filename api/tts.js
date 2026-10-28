// POST /tts { text, lang, gender, rate, pitch } -> audio/mpeg   (Pro only; one-click MP3 download, no screen sharing)
const A = require('./_lib/auth');

// Neural voice per language: [female, male]
const VOICES = {
  'en-US': ['en-US-AriaNeural', 'en-US-GuyNeural'], 'en-GB': ['en-GB-SoniaNeural', 'en-GB-RyanNeural'],
  'en-AU': ['en-AU-NatashaNeural', 'en-AU-WilliamNeural'], 'en-CA': ['en-CA-ClaraNeural', 'en-CA-LiamNeural'],
  'en-IN': ['en-IN-NeerjaNeural', 'en-IN-PrabhatNeural'], 'en-IE': ['en-IE-EmilyNeural', 'en-IE-ConnorNeural'],
  'fr-FR': ['fr-FR-DeniseNeural', 'fr-FR-HenriNeural'], 'fr-CA': ['fr-CA-SylvieNeural', 'fr-CA-JeanNeural'],
  'fr-BE': ['fr-BE-CharlineNeural', 'fr-BE-GerardNeural'], 'fr-CH': ['fr-CH-ArianeNeural', 'fr-CH-FabriceNeural'],
  'ar-SA': ['ar-SA-ZariyahNeural', 'ar-SA-HamedNeural'], 'ar-MA': ['ar-MA-MounaNeural', 'ar-MA-JamalNeural'],
  'ar-EG': ['ar-EG-SalmaNeural', 'ar-EG-ShakirNeural'], 'ar-AE': ['ar-AE-FatimaNeural', 'ar-AE-HamdanNeural'],
  'ar-DZ': ['ar-DZ-AminaNeural', 'ar-DZ-IsmaelNeural'], 'ar-TN': ['ar-TN-ReemNeural', 'ar-TN-HediNeural'],
  'es-ES': ['es-ES-ElviraNeural', 'es-ES-AlvaroNeural'], 'es-MX': ['es-MX-DaliaNeural', 'es-MX-JorgeNeural'],
  'de-DE': ['de-DE-KatjaNeural', 'de-DE-ConradNeural'], 'it-IT': ['it-IT-ElsaNeural', 'it-IT-DiegoNeural'],
  'pt-BR': ['pt-BR-FranciscaNeural', 'pt-BR-AntonioNeural'], 'pt-PT': ['pt-PT-RaquelNeural', 'pt-PT-DuarteNeural'],
  'nl-NL': ['nl-NL-ColetteNeural', 'nl-NL-MaartenNeural'], 'tr-TR': ['tr-TR-EmelNeural', 'tr-TR-AhmetNeural'],
  'ru-RU': ['ru-RU-SvetlanaNeural', 'ru-RU-DmitryNeural'], 'ja-JP': ['ja-JP-NanamiNeural', 'ja-JP-KeitaNeural'],
  'zh-CN': ['zh-CN-XiaoxiaoNeural', 'zh-CN-YunxiNeural'], 'hi-IN': ['hi-IN-SwaraNeural', 'hi-IN-MadhurNeural'],
};
const DEFAULT_BY_LANG = { en: 'en-US', fr: 'fr-FR', ar: 'ar-SA', es: 'es-ES', de: 'de-DE', it: 'it-IT', pt: 'pt-BR', nl: 'nl-NL', tr: 'tr-TR', ru: 'ru-RU', ja: 'ja-JP', zh: 'zh-CN', hi: 'hi-IN' };

function pickVoice(lang, gender) {
  const p = String(lang || 'en-US').replace('_', '-').split('-');
  let code = p[0].toLowerCase() + (p[1] ? '-' + p[1].toUpperCase() : '');
  if (!VOICES[code]) code = DEFAULT_BY_LANG[p[0].toLowerCase()] || 'en-US';
  return VOICES[code][gender === 'male' ? 1 : 0];
}
const pct = (n) => (n >= 0 ? '+' : '') + Math.round(Math.max(-50, Math.min(100, n))) + '%';

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'method' });
  const b = A.readBody(req);
  // Pro via cookie (same site) or via license key (when another host, e.g. Hostinger, forwards the request)
  let pro = !!(await A.getSession(req)).pro;
  if (!pro && b.key) { try { pro = await A.checkKey(String(b.key).trim()); } catch (e) { pro = false; } }
  if (!pro) return res.status(402).json({ error: 'subscription required' });
  if (A.limited('tts:' + A.clientIp(req), 40, 10 * 60 * 1000)) return res.status(429).json({ error: 'busy' });

  const text = String(b.text || '').replace(/\s+/g, ' ').trim().slice(0, 5000);
  if (!text) return res.status(400).json({ error: 'text' });
  const voice = pickVoice(b.lang, b.gender);
  const rate = pct((Number(b.rate) || 1) * 100 - 100);
  const pitch = pct(((Number(b.pitch) || 1) - 1) * 50);

  try {
    const lib = require('msedge-tts');
    const MsEdgeTTS = lib.MsEdgeTTS;
    const OF = lib.OUTPUT_FORMAT || (MsEdgeTTS && MsEdgeTTS.OUTPUT_FORMAT);
    const tts = new MsEdgeTTS();
    await tts.setMetadata(voice, OF.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
    const out = await tts.toStream(text, { rate, pitch });
    const stream = out && out.audioStream ? out.audioStream : out;
    const chunks = [];
    await new Promise((ok, fail) => {
      const t = setTimeout(() => fail(new Error('timeout')), 25000);
      stream.on('data', (c) => chunks.push(Buffer.from(c)));
      stream.on('end', () => { clearTimeout(t); ok(); });
      stream.on('close', () => { clearTimeout(t); ok(); });
      stream.on('error', (e) => { clearTimeout(t); fail(e); });
    });
    try { tts.close && tts.close(); } catch (e) {}
    const buf = Buffer.concat(chunks);
    if (buf.length < 500) throw new Error('empty audio (' + buf.length + ' bytes)');
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', buf.length);
    return res.status(200).send(buf);
  } catch (e) {
    return res.status(502).json({ error: 'tts_failed', detail: String((e && (e.message || e)) || 'unknown').slice(0, 160) });
  }
};
