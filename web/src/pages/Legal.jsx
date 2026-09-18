import { Link } from 'react-router-dom';

// Plain prose on a narrow measure. Legal text that nobody can read is
// legal text nobody agreed to in any meaningful sense, so this is set
// like something written to be read rather than to be scrolled past.

function Page({ title, updated, children }) {
  return (
    <article className="rise mx-auto max-w-2xl">
      <h1 className="display text-3xl text-ink sm:text-4xl">{title}</h1>
      <p className="mt-2 text-xs text-graphite">Last changed {updated}</p>
      <div className="mt-10 space-y-8">{children}</div>
    </article>
  );
}

function Clause({ heading, children }) {
  return (
    <section>
      <h2 className="display-sm text-lg text-ink">{heading}</h2>
      <div className="measure mt-2 space-y-3 text-sm leading-relaxed text-ink-soft">{children}</div>
    </section>
  );
}

export function Terms() {
  return (
    <Page title="Terms of use" updated="18 September 2026">
      <p className="measure text-base leading-relaxed text-ink-soft">
        Oction is a place where people sell physical things to each other by auction. These terms
        are what you agreed to when you opened an account. They are written plainly on purpose.
      </p>

      <Clause heading="A bid is an offer you cannot take back">
        <p>
          When you place a bid you are offering to buy that lot at that price. If the auction ends
          with your bid highest and the seller&apos;s reserve met, you have bought it. There is no
          cooling-off period between the hammer and your obligation to pay.
        </p>
        <p>
          Bidding on your own lot is not allowed, nor is bidding on it through another account. We
          look for this.
        </p>
      </Clause>

      <Clause heading="The close can move">
        <p>
          A bid placed in the final seconds pushes the closing time out. This is deliberate: it
          means the lot goes to whoever values it most rather than to whoever times a click best. A
          lot may therefore close later than the time originally shown against it.
        </p>
      </Clause>

      <Clause heading="Winning, and what happens if you do not pay">
        <p>
          Winning reserves the lot for you for a limited window, shown on the order. If you do not
          complete checkout inside it, the lot is offered to the next highest bidder at their own
          bid and you lose the claim.
        </p>
      </Clause>

      <Clause heading="Selling">
        <p>
          Listing requires a verified seller account. You are responsible for describing a lot
          accurately, for owning what you list, and for it being legal to sell. Once bidding has
          started you cannot withdraw the lot or change its photographs.
        </p>
        <p>
          We may take a listing down without warning if it is reported and the report is upheld.
        </p>
      </Clause>

      <Clause heading="When something goes wrong">
        <p>
          If an item you paid for never arrives, or is not what was described, open a dispute from
          the order. A person reads it and decides. That decision is recorded against the order.
        </p>
      </Clause>

      <Clause heading="Closing your account">
        <p>
          You can close your account at any time from{' '}
          <Link to="/settings" className="text-ink underline underline-offset-2">
            settings
          </Link>
          , provided you have no lot still running, no unpaid order and no open dispute. What
          happens to your data is set out in the{' '}
          <Link to="/privacy" className="text-ink underline underline-offset-2">
            privacy notice
          </Link>
          .
        </p>
      </Clause>
    </Page>
  );
}

export function Privacy() {
  return (
    <Page title="Privacy notice" updated="18 September 2026">
      <p className="measure text-base leading-relaxed text-ink-soft">
        What this site keeps about you, why, and how to get rid of it.
      </p>

      <Clause heading="What is kept">
        <p>
          Your email address and display name, because an auction needs to be able to reach you and
          other bidders need to see who they are bidding against. A shipping address, once you give
          one at checkout, so the seller can post the thing to you.
        </p>
        <p>
          Every bid you place, with its time and amount. This is the record that makes a price
          checkable and a dispute decidable.
        </p>
      </Clause>

      <Clause heading="Your address, and what is done instead of keeping it">
        <p>
          Your IP address is not stored. What is stored is a salted digest of it — a one-way value
          that can answer &ldquo;were these two bids from the same connection&rdquo; and nothing
          else. It cannot be turned back into an address. It exists so that a seller bidding on
          their own lots through a second account can be noticed.
        </p>
      </Clause>

      <Clause heading="Email">
        <p>
          Transactional notices only: being outbid, winning, a watched lot closing. Every one of
          them has an off switch in{' '}
          <Link to="/settings" className="text-ink underline underline-offset-2">
            settings
          </Link>
          . There is no marketing list and nothing is sold to anybody.
        </p>
      </Clause>

      <Clause heading="Closing your account, honestly">
        <p>
          Closing an account removes your email address, display name, saved shipping address and
          everything that only ever concerned you — your watchlist and any pending links.
        </p>
        <p>
          It does not delete your bids. A right to erasure is not a right to unwind a finished
          auction: those rows are what a price other people relied on was built from, and what a
          dispute they were party to is decided on. They stay, with your name replaced by
          &ldquo;Closed account&rdquo;. This is the narrow exception the law makes for records
          needed for a contract you were part of, and it is the only thing kept.
        </p>
      </Clause>

      <Clause heading="Getting an answer">
        <p>
          If you want to know what is held about you, or think something here is wrong, write to the
          address on the account you received mail from and it will be answered.
        </p>
      </Clause>
    </Page>
  );
}
