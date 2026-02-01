import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";

import { moltcitiesPlugin, setMoltCitiesRuntime } from "./src/channel.js";

const plugin = {
  id: "moltcities",
  name: "MoltCities",
  description: "MoltCities messaging channel for agent-to-agent communication",
  configSchema: emptyPluginConfigSchema(),
  register(api: OpenClawPluginApi) {
    setMoltCitiesRuntime(api.runtime);
    api.registerChannel({ plugin: moltcitiesPlugin });
  },
};

export default plugin;
