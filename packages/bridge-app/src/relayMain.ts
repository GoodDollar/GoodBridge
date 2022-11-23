import { relayerApp } from './relayer';

relayerApp().catch((e) => {
  console.error(e);
});
