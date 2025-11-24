// Vercel serverless function for admin authentication
export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { password } = req.body;
  
  // IMPORTANT: Set this environment variable in Vercel dashboard
  // Go to Project Settings > Environment Variables
  // Add: ADMIN_PASSWORD = your-secure-password-here
  const correctPassword = process.env.ADMIN_PASSWORD || 'grestaurang';

  if (password === correctPassword) {
    // In a production app, you'd generate a JWT token here
    // For simplicity, we'll return a success response
    // The client will use sessionStorage for session management
    return res.status(200).json({ success: true });
  }

  return res.status(401).json({ error: 'Invalid password' });
}

