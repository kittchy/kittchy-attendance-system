import { useState } from "react";
import { HistoryPage } from "./pages/HistoryPage";
import { HomePage } from "./pages/HomePage";

type Page = "home" | "history";

function App() {
  const [page, setPage] = useState<Page>("home");

  if (page === "history") {
    return <HistoryPage onBack={() => setPage("home")} />;
  }

  return <HomePage onNavigateHistory={() => setPage("history")} />;
}

export default App;
