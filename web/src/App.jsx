import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Shell } from './components/Shell.jsx';
import { Button, EmptyState, RowSkeleton } from './components/ui.jsx';
import { useAuth } from './auth.jsx';
import { Catalog } from './pages/Catalog.jsx';
import { ItemRoom } from './pages/ItemRoom.jsx';
import { Audit } from './pages/Audit.jsx';
import { Orders } from './pages/Orders.jsx';
import { SellerDashboard } from './pages/SellerDashboard.jsx';
import { NewListing } from './pages/NewListing.jsx';
import { SignIn } from './pages/SignIn.jsx';
import { Watchlist } from './pages/Watchlist.jsx';
import { Settings } from './pages/Settings.jsx';
import { Admin } from './pages/Admin.jsx';
import { Verify } from './pages/Verify.jsx';
import { Reset } from './pages/Reset.jsx';
import { Terms, Privacy } from './pages/Legal.jsx';

function Private({ children }) {
  const { user, ready } = useAuth();
  const location = useLocation();
  if (!ready)
    return (
      <div className="py-16">
        <RowSkeleton />
      </div>
    );
  if (!user) return <Navigate to="/sign-in" state={{ from: location.pathname }} replace />;
  return children;
}

export default function App() {
  return (
    <Shell>
      <Routes>
        <Route path="/" element={<Catalog />} />
        <Route path="/lot/:id" element={<ItemRoom />} />
        <Route path="/lot/:id/audit" element={<Audit />} />
        <Route path="/sign-in" element={<SignIn />} />
        <Route path="/verify" element={<Verify />} />
        <Route path="/reset" element={<Reset />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route
          path="/watching"
          element={
            <Private>
              <Watchlist />
            </Private>
          }
        />
        <Route
          path="/settings"
          element={
            <Private>
              <Settings />
            </Private>
          }
        />
        <Route
          path="/staff"
          element={
            <Private>
              <Admin />
            </Private>
          }
        />
        <Route
          path="/orders"
          element={
            <Private>
              <Orders />
            </Private>
          }
        />
        <Route
          path="/selling"
          element={
            <Private>
              <SellerDashboard />
            </Private>
          }
        />
        <Route
          path="/selling/new"
          element={
            <Private>
              <NewListing />
            </Private>
          }
        />
        <Route
          path="*"
          element={
            <EmptyState
              title="No such page."
              action={<Button to="/">Back to the catalogue</Button>}
            >
              The lot may have been withdrawn, or the link may have outlived it.
            </EmptyState>
          }
        />
      </Routes>
    </Shell>
  );
}
