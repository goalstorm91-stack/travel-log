import { Link } from "react-router-dom";

type Tab = "journal" | "route" | "expenses";

export default function TripTabs({ tripId, active }: { tripId: string; active: Tab }) {
  const tabs: { key: Tab; label: string; to: string }[] = [
    { key: "journal", label: "기록", to: `/trips/${tripId}` },
    { key: "route", label: "동선", to: `/trips/${tripId}/route` },
    { key: "expenses", label: "지출/정산", to: `/trips/${tripId}/expenses` },
  ];

  return (
    <div className="flex border-b border-gray-100 px-4">
      {tabs.map((tab) =>
        tab.key === active ? (
          <div
            key={tab.key}
            className="flex-1 border-b-2 border-indigo-600 py-3 text-center text-sm font-semibold text-indigo-600"
          >
            {tab.label}
          </div>
        ) : (
          <Link
            key={tab.key}
            to={tab.to}
            className="flex-1 border-b-2 border-transparent py-3 text-center text-sm font-semibold text-gray-400"
          >
            {tab.label}
          </Link>
        ),
      )}
    </div>
  );
}
