// Local/VPS process definitions for pm2: `pm2 start ecosystem.config.cjs`.
// The API serves the built web build (apps/web/dist) on the same origin.
module.exports = {
  apps: [
    {
      name: "plotgo-api",
      cwd: "C:/Users/nwach/Downloads/PlotGo/apps/api",
      // Invoke the tsx CLI directly (the .bin shim is a shell script, not
      // runnable by node under pm2).
      script: "node_modules/tsx/dist/cli.mjs",
      args: "src/index.ts",
      interpreter: "node",
      autorestart: true,
      max_restarts: 10,
      restart_delay: 3000,
    },
  ],
};
