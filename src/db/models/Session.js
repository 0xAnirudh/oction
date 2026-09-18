import mongoose from 'mongoose';

// One row per sign-in, so a session can be ended on its own.
//
// The account-wide cutoff on User is a blunt instrument: it ends every
// session at once, which is right for a password reset and wrong for
// "sign out my old laptop". Each token now carries a jti that points
// here, and a revoked row refuses the token that names it.

const sessionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    jti: { type: String, required: true, unique: true },

    // Enough to recognise a device in a list without building a
    // fingerprint of it. The user agent is truncated on the way in.
    label: { type: String, default: 'Unknown device' },
    // Coarse and salted - a city-sized hint, not an address.
    ipHash: { type: String, default: null },

    lastSeenAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// Mongo sweeps a session once it is past the point where its token
// would have expired anyway.
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
sessionSchema.index({ userId: 1, revokedAt: 1 });

sessionSchema.methods.toPublic = function toPublic(currentJti) {
  return {
    id: this._id.toString(),
    label: this.label,
    lastSeenAt: this.lastSeenAt,
    createdAt: this.createdAt,
    current: this.jti === currentJti,
  };
};

export const Session = mongoose.models.Session ?? mongoose.model('Session', sessionSchema);
