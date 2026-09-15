import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';

const linkClass = ({ isActive }) =>
  `text-sm transition-colors ${isActive ? 'text-ink' : 'text-graphite hover:text-ink'}`;

export function Shell({ children }) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="min-h-dvh bg-paper">
      <header className="border-b border-rule">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-5 py-4">
          <Link to="/" className="display text-xl tracking-tight text-ink">
            Oction
          </Link>

          <nav className="flex items-center gap-5">
            <NavLink to="/" className={linkClass} end>
              Catalogue
            </NavLink>
            {user && (
              <>
                <NavLink to="/watching" className={linkClass}>
                  Watching
                </NavLink>
                <NavLink to="/orders" className={linkClass}>
                  Won
                </NavLink>
                <NavLink to="/selling" className={linkClass}>
                  Selling
                </NavLink>
                {user.isAdmin && (
                  <NavLink to="/staff" className={linkClass}>
                    Staff
                  </NavLink>
                )}
              </>
            )}
          </nav>

          <div className="ml-auto flex items-center gap-4">
            {user ? (
              <>
                <Link
                  to="/settings"
                  className="hidden text-sm text-graphite hover:text-ink sm:inline"
                >
                  {user.displayName}
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    signOut();
                    navigate('/');
                  }}
                  className="text-sm text-graphite hover:text-ink"
                >
                  Sign out
                </button>
              </>
            ) : (
              <Link to="/sign-in" className="text-sm text-ink hover:text-graphite">
                Sign in
              </Link>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 py-10">{children}</main>

      <footer className="mx-auto max-w-6xl border-t border-rule px-5 py-8 text-xs text-graphite">
        Bids are binding. A bid in the final seconds extends the lot.
      </footer>
    </div>
  );
}
