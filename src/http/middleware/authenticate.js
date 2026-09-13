import { userFromToken } from '../../services/auth.js';

function bearer(req) {
  const header = req.get('authorization') ?? '';
  return header.startsWith('Bearer ') ? header.slice(7) : null;
}

// Attaches req.user when there is one. Never rejects - routes that need
// a user say so themselves, which keeps "who is this" and "are they
// allowed" as separate questions.
export async function authenticate(req, _res, next) {
  const token = bearer(req);
  if (!token) return next();
  try {
    req.user = (await userFromToken(token)) ?? undefined;
  } catch {
    req.user = undefined;
  }
  next();
}

export function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'authentication_required' });
  next();
}

export function requireSeller(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'authentication_required' });
  if (req.user.sellerStatus !== 'verified' && !req.user.isAdmin) {
    return res.status(403).json({
      error: 'seller_not_verified',
      message: 'Listing an item needs a verified seller account.',
    });
  }
  next();
}
