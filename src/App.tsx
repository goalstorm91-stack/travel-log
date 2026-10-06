import { Suspense, lazy } from "react";
import { Routes, Route } from "react-router-dom";
import BottomNav from "./components/BottomNav";
import Home from "./pages/Home";
import NewTrip from "./pages/NewTrip";
import TripDetail from "./pages/TripDetail";
import DayEditor from "./pages/DayEditor";
import Expenses from "./pages/Expenses";
import Settings from "./pages/Settings";
import PhotoTrip from "./pages/PhotoTrip";
import Notice from "./pages/Notice";

const MapPage = lazy(() => import("./pages/MapPage"));
const RoutePage = lazy(() => import("./pages/RoutePage"));

export default function App() {
  return (
    <div className="app-shell">
      <div className="no-scrollbar flex-1 overflow-y-auto pb-2">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route
            path="/map"
            element={
              <Suspense fallback={<div className="px-4 pt-6 text-sm text-gray-400">지도를 불러오는 중...</div>}>
                <MapPage />
              </Suspense>
            }
          />
          <Route path="/trips/new" element={<NewTrip />} />
          <Route path="/trips/from-photos" element={<PhotoTrip />} />
          <Route path="/trips/:tripId" element={<TripDetail />} />
          <Route path="/trips/:tripId/days/new" element={<DayEditor />} />
          <Route path="/trips/:tripId/days/:dayId" element={<DayEditor />} />
          <Route
            path="/trips/:tripId/route"
            element={
              <Suspense fallback={<div className="px-4 pt-6 text-sm text-gray-400">지도를 불러오는 중...</div>}>
                <RoutePage />
              </Suspense>
            }
          />
          <Route path="/trips/:tripId/expenses" element={<Expenses />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/notice" element={<Notice />} />
        </Routes>
      </div>
      <BottomNav />
    </div>
  );
}
