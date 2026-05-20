import { getDb } from '@/lib/db';
import { isRegistrationOpen } from '@/lib/registration';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const db = await getDb();
  const { count } = await db.prepare('SELECT COUNT(*) as count FROM users').get();
  const open = isRegistrationOpen();

  res.status(200).json({
    hasUsers: count > 0,
    registrationOpen: open || count === 0,
    allowRegistration: open,
  });
}
