// Vercel Serverless Function — POST /api/scorecard
//
// Receives a completed scorecard from /scorecard and:
//   1. saves it in the Campus Velocity app (app.campusvelocity.com), which
//      recalculates the scores and keeps it as the school's future Day 0 baseline;
//   2. adds the person to the Kit newsletter ONLY if they ticked the consent box.
//
// Environment variables (Vercel → Project Settings → Environment Variables):
//   SCORECARD_INTAKE_SECRET  same value as in the app project
//   KIT_API_KEY              Kit v4 API key
//   APP_URL                  optional, defaults to https://app.campusvelocity.com

const CONSENT_TEXT =
  'Send me Campus Velocity, the weekly campus operations newsletter. I can unsubscribe at any time.';

const isEmail = (v) => typeof v === 'string' && v.length <= 254 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v);
const clean = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email, name, school, answers, consent } = req.body || {};
  if (!isEmail(email)) return res.status(400).json({ error: 'A valid email is required' });
  if (!Array.isArray(answers) || answers.length !== 12 || answers.some((a) => ![0, 1, 2, 3].includes(a))) {
    return res.status(400).json({ error: 'Incomplete scorecard' });
  }
  const optedIn = consent === true;

  const results = await Promise.allSettled([
    saveToApp({ email, name: clean(name, 120), school: clean(school, 200), answers, optedIn }),
    optedIn ? subscribeToKit({ email, name: clean(name, 120) }) : Promise.resolve('skipped'),
  ]);

  const [app, kit] = results;
  if (app.status === 'rejected') console.error('Scorecard save failed:', app.reason);
  if (kit.status === 'rejected') console.error('Kit subscribe failed:', kit.reason);

  // The person always gets their results; failures are logged for follow-up.
  return res.status(200).json({ saved: app.status === 'fulfilled', subscribed: optedIn && kit.status === 'fulfilled' });
}

async function saveToApp({ email, name, school, answers, optedIn }) {
  const secret = process.env.SCORECARD_INTAKE_SECRET;
  if (!secret) throw new Error('SCORECARD_INTAKE_SECRET is not set');
  const appUrl = process.env.APP_URL || 'https://app.campusvelocity.com';

  const r = await fetch(`${appUrl}/api/scorecard`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` },
    body: JSON.stringify({
      email,
      ...(name ? { full_name: name } : {}),
      ...(school ? { school_name: school } : {}),
      answers,
      consent_marketing: optedIn,
      // What they agreed to, or the fact that they didn't, recorded with the submission.
      consent_text: optedIn ? CONSENT_TEXT : `Not ticked: ${CONSENT_TEXT}`,
    }),
  });
  if (!r.ok) throw new Error(`App responded ${r.status}: ${await r.text()}`);
  return r.json();
}

async function subscribeToKit({ email, name }) {
  const apiKey = process.env.KIT_API_KEY;
  if (!apiKey) throw new Error('KIT_API_KEY is not set');

  const payload = { email_address: email, state: 'active' };
  if (name) payload.first_name = name;

  const r = await fetch('https://api.kit.com/v4/subscribers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Kit-Api-Key': apiKey },
    body: JSON.stringify(payload),
  });
  if (!r.ok) throw new Error(`Kit responded ${r.status}: ${await r.text()}`);
  return 'subscribed';
}
