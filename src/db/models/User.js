import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: { type: String, required: true },
    displayName: { type: String, required: true, trim: true, maxlength: 40 },

    // Anyone may bid. Listing an item needs a verified seller, which is
    // a human decision somebody makes in the admin tools - the flag is
    // here so the route has something to check.
    sellerStatus: {
      type: String,
      enum: ['unverified', 'pending', 'verified'],
      default: 'unverified',
      index: true,
    },
    isAdmin: { type: Boolean, default: false },

    emailVerified: { type: Boolean, default: false },
    emailVerifiedAt: { type: Date, default: null },

    // Every token issued before this moment is refused. It is the whole
    // revocation mechanism: a JWT cannot be taken back, but it can be
    // outrun by a timestamp the server checks on every request. Set on
    // password reset, so resetting really does sign out the other
    // devices rather than only appearing to.
    sessionsValidFrom: { type: Date, default: null },

    // Filled in at first checkout and reused as the default afterwards.
    defaultShipping: {
      fullName: String,
      line1: String,
      line2: String,
      city: String,
      region: String,
      postcode: String,
      country: String,
    },
  },
  { timestamps: true },
);

userSchema.methods.toPublic = function toPublic() {
  return {
    id: this._id.toString(),
    displayName: this.displayName,
    sellerStatus: this.sellerStatus,
  };
};

userSchema.methods.toSelf = function toSelf() {
  return {
    ...this.toPublic(),
    email: this.email,
    isAdmin: this.isAdmin,
    emailVerified: this.emailVerified,
    defaultShipping: this.defaultShipping ?? null,
  };
};

export const User = mongoose.models.User ?? mongoose.model('User', userSchema);
