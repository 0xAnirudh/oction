// One prefix, one place. Socket.io room names deliberately match the
// `auction:{itemId}` shape from the spec so a room name read off a
// dashboard is the same string you would look for in a log.

const P = 'oc';

export const keys = {
  itemState: (itemId) => `${P}:item:${itemId}:state`,
  bidRateUser: (userId) => `${P}:rate:bid:u:${userId}`,
  bidRateIp: (ip) => `${P}:rate:bid:ip:${ip}`,
  mediaCache: (itemId) => `${P}:item:${itemId}:media`,
  authRateIp: (ip) => `${P}:rate:auth:ip:${ip}`,
  authRateAccount: (email) => `${P}:rate:auth:acct:${email}`,
  idempotency: (userId, key) => `${P}:idem:${userId}:${key}`,
  room: (itemId) => `auction:${itemId}`,
};
