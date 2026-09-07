import { mount } from 'svelte';

import App from './App.svelte';
import './app.css';

/** Mounts the app onto the page's `#app` element, throwing if the served page carries none. */
export function mountApp(): ReturnType<typeof mount> {
  const target = document.getElementById('app');
  if (!target) {
    throw new Error('index.html carries no #app mount element');
  }
  return mount(App, { target });
}

export default mountApp();
