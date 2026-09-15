import mongoose from 'mongoose';

// Single-use links: confirm an address, reset a password.
//
// What is stored is a SHA-256 of the token, never the token. A dump of
// this collection is then useless on its own - it cannot be replayed
// into a password reset, because the value that goes in the URL is not
// the value that is written down.

const tokenSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    kind: { type: String, enum: ['verify_email', 'password_reset'], required: true },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// Mongo sweeps expired rows itself, so a token that was never used stops
// existing rather than sitting there indefinitely.
tokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const Token = mongoose.models.Token ?? mongoose.model('Token', tokenSchema);
