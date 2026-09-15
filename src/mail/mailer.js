import { config } from '../config.js';
import { log } from '../log.js';

// Two drivers behind one shape, the same arrangement as media storage.
// 'log' prints the message and returns, so registration, verification
// and password reset all work end to end on a fresh clone with nothing
// configured - the link is in the terminal. 'resend' needs an API key.

const logDriver = {
  name: 'log',
  async send({ to, subject, text }) {
    log.info('email (not sent - MAIL_DRIVER=log)', { to, subject });
    // The body goes to stdout rather than the structured log so a
    // verification link is something you can actually click in a
    // terminal rather than a JSON-escaped string.
    console.log(`\n--- ${subject} -> ${to} ---\n${text}\n---\n`);
    return { id: 'logged' };
  },
};

const resendDriver = {
  name: 'resend',
  async send({ to, subject, text, html }) {
    if (!config.mail.resendApiKey) {
      throw new Error('MAIL_DRIVER=resend needs RESEND_API_KEY');
    }
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${config.mail.resendApiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ from: config.mail.from, to: [to], subject, text, html }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`resend rejected the message (${res.status}): ${body.slice(0, 200)}`);
    }
    return res.json();
  },
};

// Accepts and discards. Exists so the test suite is not buried in
// verification emails it did not ask about.
const silentDriver = {
  name: 'silent',
  async send() {
    return { id: 'silent' };
  },
};

// Keeps what it was given, so a test can assert on the message a real
// user would have received - subject, body, and the link in it - rather
// than on a mock of the thing that sends it.
const outbox = [];

const captureDriver = {
  name: 'capture',
  async send(message) {
    outbox.push(message);
    return { id: `captured-${outbox.length}` };
  },
};

export function drainOutbox() {
  return outbox.splice(0, outbox.length);
}

const DRIVERS = {
  log: logDriver,
  resend: resendDriver,
  silent: silentDriver,
  capture: captureDriver,
};

export function getMailer() {
  const driver = DRIVERS[config.mail.driver];
  if (!driver) throw new Error(`unknown MAIL_DRIVER: ${config.mail.driver}`);
  return driver;
}

// Mail is never worth failing a request over. A bid that went through
// and an email that did not is a worse outcome than a missing email, so
// the throw stops here and becomes a log line.
export async function send(message) {
  try {
    return await getMailer().send(message);
  } catch (err) {
    log.error('email failed', { to: message.to, subject: message.subject, err: err.message });
    return null;
  }
}
