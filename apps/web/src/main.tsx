import React from 'react';
import ReactDOM from 'react-dom/client';

// Bundle the typefaces the engine renders into card text. Without these the
// canvas falls back to whatever the user's machine happens to have. Variable
// fonts ship every weight in a single woff2 file (~50-90kb each) so the cost
// is reasonable for the visual variety it unlocks.
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
import '@fontsource/jetbrains-mono/700.css';
import '@fontsource/instrument-serif/400.css';
import '@fontsource/instrument-serif/400-italic.css';
import '@fontsource-variable/fraunces';
import '@fontsource-variable/nunito';
import '@fontsource-variable/roboto-slab';

import { App } from './app/App';
import './styles/tokens.css';
import './styles/globals.css';

async function waitForFonts(): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) return;
  try {
    await document.fonts.ready;
  } catch {
    // Font load failed somewhere; still render — engine will fall back to the
    // declared font stack on canvas.
  }
}

void waitForFonts().then(() => {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
});
