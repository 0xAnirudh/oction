import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { requireAuth } from '../middleware/authenticate.js';
import { loginSchema, registerSchema } from '../schemas.js';
import { login, register } from '../../services/auth.js';

export const authRouter = Router();

authRouter.post('/auth/register', validate(registerSchema), async (req, res) => {
  const result = await register(req.valid.body);
  if (result.error) {
    return res.status(409).json({
      error: result.error,
      message: 'That email is already registered.',
    });
  }
  res.status(201).json({ token: result.token, user: result.user.toSelf() });
});

authRouter.post('/auth/login', validate(loginSchema), async (req, res) => {
  const result = await login(req.valid.body);
  if (result.error) {
    return res.status(401).json({
      error: result.error,
      message: 'Those details do not match an account.',
    });
  }
  res.json({ token: result.token, user: result.user.toSelf() });
});

authRouter.get('/auth/me', requireAuth, (req, res) => {
  res.json({ user: req.user.toSelf() });
});
