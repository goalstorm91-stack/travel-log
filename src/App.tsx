import { Routes, Route } from "react-router-dom";
import BottomNav from "./components/BottomNav";
import Home from "./pages/Home";
import NewTrip from "./pages/NewTrip";
import TripDetail from "./pages/TripDetail";
import DayEditor from "./pages/DayEditor";
import Expenses from "./pages/Expenses";
import MapPage from "./pages/MapPage";
import Settings from "./pages/Settings";

export default function App() {
  return (
    <div className="app-shell">
      <div className="no-scrollbar flex-1 overflow-y-auto pb-2">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/map" element={<MapPage />} />
          <Route path="/trips/new" element={<NewTrip />} />
          <Route path="/trips/:tripId" element={<TripDetail />} />
          <Route path="/trips/:tripId/days/new" element={<DayEditor />} />
          <Route path="/trips/:tripId/days/:dayId" element={<DayEditor />} />
          <Route path="/trips/:tripId/expenses" element={<Expenses />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </div>
      <BottomNav />
    </div>
  );
}
