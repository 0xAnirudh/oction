import { config } from '../config.js';
import { formatCents } from '../core/money.js';

const link = (path) => `${config.appUrl.replace(/\/$/, '')}${path}`;

// Plain text, deliberately. These are transactional notes with one thing
// to say and one thing to click; an HTML template with a masthead would
// be more to maintain and more to land in a spam folder.

export const verifyEmail = (user, token) => ({
  to: user.email,
  subject: 'Confirm your email for Oction',
  text: `Hello ${user.displayName},

Confirm this address to finish setting up your Oction account:

${link(`/verify?token=${token}`)}

The link is good for 24 hours. If you did not open an account, ignore
this and nothing happens.`,
});

export const resetPassword = (user, token) => ({
  to: user.email,
  subject: 'Reset your Oction password',
  text: `Hello ${user.displayName},

Someone asked to reset the password on this account. If it was you:

${link(`/reset?token=${token}`)}

The link is good for one hour and can be used once. Using it signs out
every device currently holding a session.

If it was not you, ignore this. Your password has not changed.`,
});

export const outbid = (user, item, amountCents) => ({
  to: user.email,
  subject: `You have been outbid on ${item.title}`,
  text: `Hello ${user.displayName},

${item.title} now stands at ${formatCents(amountCents)} and you are no
longer the highest bidder.

${link(`/lot/${item._id}`)}

Bidding closes ${new Date(item.endTime).toUTCString()}. A bid in the
final seconds moves the close, so there is no advantage in waiting.`,
});

export const wonLot = (user, item, order) => ({
  to: user.email,
  subject: `You won ${item.title}`,
  text: `Hello ${user.displayName},

You won ${item.title} at ${formatCents(order.amountCents)}.

Confirm your address and complete checkout within the hold window:

${link('/orders')}

The hold expires ${new Date(order.expiresAt).toUTCString()}. After that
the lot is offered to the next bidder.`,
});

export const rolledDown = (user, item, order) => ({
  to: user.email,
  subject: `${item.title} has been offered to you`,
  text: `Hello ${user.displayName},

The winning bidder on ${item.title} did not complete checkout, so the
lot has been offered to you at your bid of ${formatCents(order.amountCents)}.

${link('/orders')}

The hold expires ${new Date(order.expiresAt).toUTCString()}.`,
});

export const closingSoon = (user, item, endsAt) => ({
  to: user.email,
  subject: `${item.title} closes soon`,
  text: `Hello ${user.displayName},

A lot on your watchlist is about to close.

${item.title}
${link(`/lot/${item._id}`)}

Bidding closes ${new Date(endsAt).toUTCString()}.`,
});
