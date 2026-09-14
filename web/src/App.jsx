import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Shell } from './components/Shell.jsx';
import { useAuth } from './auth.jsx';
import { Catalog } from './pages/Catalog.jsx';
import { ItemRoom } from './pages/ItemRoom.jsx';
import { Audit } from './pages/Audit.jsx';
import { Orders } from './pages/Orders.jsx';
import { SellerDashboard } from './pages/SellerDashboard.jsx';
import { NewListing } from './pages/NewListing.jsx';
import { SignIn } from './pages/SignIn.jsx';

function Private({ children }) {
  const { user, ready } = useAuth();
  const location = useLocation();
  if (!ready) return <p className="py-16 text-sm text-graphite">…</p>;
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
            <div className="py-16">
              <h1 className="display text-3xl text-ink">No such page.</h1>
              <p className="mt-2 text-sm text-graphite">The lot may have been withdrawn.</p>
            </div>
          }
        />
      </Routes>
    </Shell>
  );
}
