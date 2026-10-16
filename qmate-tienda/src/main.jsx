import { useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import Admin from "./Admin.jsx";

// La tienda está en "/" y el panel del dueño en "/#/admin"
function Root() {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => {
    const f = () => setHash(location.hash);
    window.addEventListener("hashchange", f);
    return () => window.removeEventListener("hashchange", f);
  }, []);
  return hash.startsWith("#/admin") ? <Admin /> : <App />;
}

createRoot(document.getElementById("root")).render(<Root />);
