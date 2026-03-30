import { useEffect, useState } from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import { auth } from "./firebase";
import { LoginForm } from "./components/LoginForm";
import { ReportList } from "./components/ReportList";
import { ReportEditor } from "./components/ReportEditor";

const App = () => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeReportId, setActiveReportId] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    const online = () => setIsOnline(true);
    const offline = () => setIsOnline(false);

    window.addEventListener("online", online);
    window.addEventListener("offline", offline);

    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
    };
  }, []);

  if (loading) {
    return (
      <main className="container">
        <p>Lade Anwendung...</p>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="container auth-shell">
        <LoginForm />
      </main>
    );
  }

  if (activeReportId) {
    return (
      <ReportEditor
        reportId={activeReportId}
        uid={user.uid}
        isOnline={isOnline}
        onBack={() => setActiveReportId(null)}
      />
    );
  }

  return <ReportList uid={user.uid} isOnline={isOnline} onOpenReport={setActiveReportId} />;
};

export default App;
