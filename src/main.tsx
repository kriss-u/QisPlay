import { ChakraProvider } from "@chakra-ui/react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { ColorModeProvider } from "./app/ColorModeProvider";
import { system } from "./app/system";
import { DialogProvider, Toaster } from "./components/dialogs";
import "./index.css";
import { registerSaveWorker } from "./workspace/backgroundSave";

registerSaveWorker();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ChakraProvider value={system}>
      <ColorModeProvider>
        <DialogProvider>
          <App />
          <Toaster />
        </DialogProvider>
      </ColorModeProvider>
    </ChakraProvider>
  </StrictMode>,
);
