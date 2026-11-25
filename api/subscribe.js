// Vercel Serverless Function — POST /api/subscribe
//
// The "Not ready yet? Get one fix a week." form on the homepage. Adds the
// address to the Kit newsletter. Uses the same KIT_API_KEY as /api/scorecard.
//
// Abuse guards: a hidden field bots fill in (silently accepted, nothing sent to
// Kit), and a simple per-address cooldown so the same address can't be hammered.

const isEmail = (v) => typeof v === 'string' && v.length <= 254 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v);
const recent = new Map(); // email -> last attempt (per warm instance; best effort)

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const { email, website } = req.body || {};
  // Bots fill the hidden field. Say yes, do nothing.
  if (typeof website === 'string' && website.trim() !== '') return res.status(200).json({ ok: true });
  const address = typeof email === 'string' ? email.trim().toLowerCase() : '';
  if (!isEmail(address)) return res.status(400).json({ error: 'A valid email is required' });

  const now = Date.now();
  if (now - (recent.get(address) || 0) < 60_000) return res.status(200).json({ ok: true });
  recent.set(address, now);
  if (recent.size > 5000) recent.clear();

  const apiKey = process.env.KIT_API_KEY;
  if (!apiKey) {
    console.error('Subscribe failed: KIT_API_KEY is not set');
    return res.status(500).json({ error: 'Not available right now' });
  }
  try {
    const r = await fetch('https://api.kit.com/v4/subscribers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Kit-Api-Key': apiKey },
      body: JSON.stringify({ email_address: address, state: 'active' }),
    });
    if (!r.ok) throw new Error(`Kit responded ${r.status}: ${await r.text()}`);
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Subscribe failed:', err);
    return res.status(502).json({ error: 'Not available right now' });
  }
}
