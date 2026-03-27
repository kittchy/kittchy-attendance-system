import { useState } from "react";
import { HistoryPage } from "./pages/HistoryPage";
import { HomePage } from "./pages/HomePage";
import { SettingsPage } from "./pages/SettingsPage";

type Page = "home" | "history" | "settings";

function App() {
  const [page, setPage] = useState<Page>("home");

  if (page === "history") {
    return <HistoryPage onBack={() => setPage("home")} />;
  }

  if (page === "settings") {
    return <SettingsPage onBack={() => setPage("home")} />;
  }

  return (
    <HomePage
      onNavigateHistory={() => setPage("history")}
      onNavigateSettings={() => setPage("settings")}
    />
  );
}

export default App;
