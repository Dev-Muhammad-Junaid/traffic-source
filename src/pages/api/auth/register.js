import { getDb } from '@/lib/db';
import { hashPassword, generateToken, setAuthCookie } from '@/lib/auth';
import { isRegistrationOpen } from '@/lib/registration';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email, password, name } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: 'Invalid email format' });
  }

  try {
    const db = await getDb();

    if (!isRegistrationOpen()) {
      const userCount = await db.prepare('SELECT COUNT(*) as count FROM users').get();
      if (userCount.count > 0) {
        return res.status(403).json({ error: 'Registration is disabled. An account already exists.' });
      }
    }

    const existing = await db
      .prepare('SELECT id FROM users WHERE email = ?')
      .get(email.toLowerCase());
    if (existing) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const passwordHash = await hashPassword(password);

    const result = await db
      .prepare('INSERT INTO users (email, password_hash, name) VALUES (?, ?, ?)')
      .run(email.toLowerCase(), passwordHash, name || null);

    const user = { id: result.lastInsertRowid, email: email.toLowerCase(), name };
    const token = generateToken(user);
    setAuthCookie(res, token);

    res.status(201).json({ user: { id: user.id, email: user.email, name: user.name } });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}
