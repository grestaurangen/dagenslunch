// Vercel serverless function to save week selections
// This stores data in Vercel KV or similar (you'll need to set this up)
// For now, this is a placeholder that validates auth

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { weekKey, selections, authToken } = req.body;

  // TODO: Verify authToken (JWT) here
  // For now, this is just a placeholder
  // In production, you'd verify the JWT and check expiration

  // TODO: Save to database (Vercel KV, MongoDB, etc.)
  // For now, we'll just return success
  // The client will continue using localStorage until backend is set up

  return res.status(200).json({ success: true, message: 'Saved (using localStorage for now)' });
}

