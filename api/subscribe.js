// Vercel Serverless Function — POST /api/subscribe
//
// Receives { email, name } from the scorecard's email capture form
// and adds the subscriber to Kit using the server-side KIT_API_KEY
// environment variable. The key never reaches the browser — only this
// function (running on Vercel's servers) ever sees it.
//
// Requires a Vercel Environment Variable named KIT_API_KEY, set under
// Project Settings -> Environment Variables.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email, name } = req.body || {};

  if (!email || typeof email !== 'string') {
    return res.status(400).json({ error: 'A valid email is required' });
  }

  const apiKey = process.env.KIT_API_KEY;
  if (!apiKey) {
    console.error('KIT_API_KEY is not set in Vercel Environment Variables');
    return res.status(500).json({ error: 'Server not configured' });
  }

  const payload = {
    email_address: email,
    state: 'active',
  };
  if (name) payload.first_name = name;

  try {
    const kitResponse = await fetch('https://api.kit.com/v4/subscribers', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Kit-Api-Key': apiKey,
      },
      body: JSON.stringify(payload),
    });

    const data = await kitResponse.json();

    if (!kitResponse.ok) {
      console.error('Kit API error:', kitResponse.status, data);
      return res.status(kitResponse.status).json({ error: 'Kit rejected the request', details: data });
    }

    return res.status(200).json({ success: true, subscriber: data.subscriber });
  } catch (err) {
    console.error('Subscribe function error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
