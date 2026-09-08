import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { ThemeProvider } from "next-themes";

const rootElement = document.getElementById("root")!;
rootElement.replaceChildren();

createRoot(rootElement).render(
  <ThemeProvider attribute="class">
    <App />
  </ThemeProvider>
);
