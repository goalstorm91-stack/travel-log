import { Suspense, lazy, useEffect } from "react";
import { Routes, Route, useLocation } from "react-router-dom";
import BottomNav from "./components/BottomNav";
import ErrorBoundary from "./components/ErrorBoundary";
import UpdateBanner from "./components/UpdateBanner";
import Home from "./pages/Home"; // the first screen stays in the main bundle; everything else loads on demand

const loaders = {
  newTrip: () => import("./pages/NewTrip"),
  photoTrip: () => import("./pages/PhotoTrip"),
  tripDetail: () => import("./pages/TripDetail"),
  dayEditor: () => import("./pages/DayEditor"),
  expenses: () => import("./pages/Expenses"),
  settings: () => import("./pages/Settings"),
  notice: () => import("./pages/Notice"),
  map: () => import("./pages/MapPage"),
  route: () => import("./pages/RoutePage"),
};

const NewTrip = lazy(loaders.newTrip);
const EditTrip = lazy(() => loaders.newTrip().then((m) => ({ default: m.EditTrip })));
const PhotoTrip = lazy(loaders.photoTrip);
const TripDetail = lazy(loaders.tripDetail);
const DayEditor = lazy(loaders.dayEditor);
const Expenses = lazy(loaders.expenses);
const Settings = lazy(loaders.settings);
const Notice = lazy(loaders.notice);
const MapPage = lazy(loaders.map);
const RoutePage = lazy(loaders.route);

// Once the first screen is up and the phone is idle, fetch the everyday pages in the
// background so tapping into them doesn't wait on the network. The heavy map/route pages
// are left out: they're loaded when needed (and are cached by the service worker anyway).
const PRELOAD = [loaders.tripDetail, loaders.newTrip, loaders.dayEditor, loaders.settings, loaders.expenses];

function useIdlePreload() {
  useEffect(() => {
    const run = () => PRELOAD.forEach((load) => void load().catch(() => undefined));
    if ("requestIdleCallback" in window) {
      const id = window.requestIdleCallback(run, { timeout: 4000 });
      return () => window.cancelIdleCallback(id);
    }
    const id = setTimeout(run, 2500);
    return () => clearTimeout(id);
  }, []);
}

function PageLoading() {
  return <div className="px-4 pt-6 text-sm text-gray-400">불러오는 중...</div>;
}

export default function App() {
  const { pathname } = useLocation();
  useIdlePreload();
  return (
    <div className="app-shell">
      <UpdateBanner />
      <div className="no-scrollbar flex-1 overflow-y-auto pb-2">
        {/* keyed by page so a crash clears as soon as someone navigates elsewhere */}
        <ErrorBoundary key={pathname}>
          <Suspense fallback={<PageLoading />}>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/map" element={<MapPage />} />
              <Route path="/trips/new" element={<NewTrip />} />
              <Route path="/trips/from-photos" element={<PhotoTrip />} />
              <Route path="/trips/:tripId" element={<TripDetail />} />
              <Route path="/trips/:tripId/edit" element={<EditTrip />} />
              <Route path="/trips/:tripId/days/new" element={<DayEditor />} />
              <Route path="/trips/:tripId/days/:dayId" element={<DayEditor />} />
              <Route path="/trips/:tripId/route" element={<RoutePage />} />
              <Route path="/trips/:tripId/expenses" element={<Expenses />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/notice" element={<Notice />} />
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </div>
      <BottomNav />
    </div>
  );
}
