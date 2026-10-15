import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import "@/App.css";
import SplashScreen from "@/screens/SplashScreen";
import HomeScreen from "@/screens/HomeScreen";
import EmptyRoomScreen from "@/screens/EmptyRoomScreen";
import AIChatScreen from "@/screens/AIChatScreen";
import VoiceChatScreen from "@/screens/VoiceChatScreen";
import FarewellScreen from "@/screens/FarewellScreen";

const IDENTITY_KEY = "nol_identity_v1";

export function loadIdentity() {
  try {
    const raw = localStorage.getItem(IDENTITY_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function saveIdentity(identity) {
  localStorage.setItem(IDENTITY_KEY, JSON.stringify(identity));
}

export function clearIdentity() {
  localStorage.removeItem(IDENTITY_KEY);
}

function RequireIdentity({ children }) {
  const [identity, setIdentity] = useState(undefined);
  useEffect(() => {
    setIdentity(loadIdentity());
  }, []);
  if (identity === undefined) return null;
  if (!identity) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <div className="App bg-app text-primary min-h-screen">
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<SplashScreen />} />
          <Route
            path="/home"
            element={
              <RequireIdentity>
                <HomeScreen />
              </RequireIdentity>
            }
          />
          <Route
            path="/empty-room"
            element={
              <RequireIdentity>
                <EmptyRoomScreen />
              </RequireIdentity>
            }
          />
          <Route
            path="/echo"
            element={
              <RequireIdentity>
                <AIChatScreen />
              </RequireIdentity>
            }
          />
          <Route
            path="/voice"
            element={
              <RequireIdentity>
                <VoiceChatScreen />
              </RequireIdentity>
            }
          />
          <Route
            path="/farewell"
            element={
              <RequireIdentity>
                <FarewellScreen />
              </RequireIdentity>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </div>
  );
}
