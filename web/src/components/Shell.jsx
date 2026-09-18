import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { GavelIcon, ShieldIcon, SignOutIcon } from './icons.jsx';

const linkClass = ({ isActive }) =>
  `relative py-1 text-sm transition-colors duration-200 ${
    isActive
      ? 'text-ink after:absolute after:inset-x-0 after:-bottom-0.5 after:h-px after:bg-ink'
      : 'text-graphite hover:text-ink'
  }`;

export function Shell({ children }) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="flex min-h-dvh flex-col bg-paper">
      <header className="sticky top-0 z-30 border-b border-rule bg-paper/85 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-5 py-3.5">
          <Link
            to="/"
            className="group flex items-center gap-2 text-ink"
            aria-label="Oction, the catalogue"
          >
            <GavelIcon
              size={17}
              className="transition-transform duration-300 group-hover:-rotate-12"
            />
            <span className="display text-xl">Oction</span>
          </Link>

          <nav className="flex items-center gap-5 overflow-x-auto">
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
                    <span className="flex items-center gap-1.5">
                      <ShieldIcon size={13} />
                      Staff
                    </span>
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
                  className="hidden max-w-[12rem] truncate text-sm text-graphite transition-colors hover:text-ink sm:block"
                >
                  {user.displayName}
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    signOut();
                    navigate('/');
                  }}
                  className="flex items-center gap-1.5 text-sm text-graphite transition-colors hover:text-ink"
                >
                  <SignOutIcon size={14} />
                  <span className="hidden sm:inline">Sign out</span>
                </button>
              </>
            ) : (
              <Link
                to="/sign-in"
                className="text-sm text-ink transition-colors hover:text-graphite"
              >
                Sign in
              </Link>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-10 sm:py-14">{children}</main>

      <footer className="border-t border-rule">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-7 text-xs text-graphite">
          <p>Bids are binding. A bid in the final seconds moves the close.</p>
          <nav className="flex gap-5">
            <Link to="/terms" className="transition-colors hover:text-ink">
              Terms
            </Link>
            <Link to="/privacy" className="transition-colors hover:text-ink">
              Privacy
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
