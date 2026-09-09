import { mount, unmount } from 'svelte';

import App from './App.svelte';
import './app.css';

// Re-exported so a render test can drive the app's real teardown path (`unmount(mountApp())`)
// without importing 'svelte' itself, which only this module's own Vite transform resolves.
export { unmount };

/** Mounts the app onto the page's `#app` element, throwing if the served page carries none. */
export function mountApp(): ReturnType<typeof mount> {
  const target = document.getElementById('app');
  if (!target) {
    throw new Error('index.html carries no #app mount element');
  }
  return mount(App, { target });
}

export default mountApp();
