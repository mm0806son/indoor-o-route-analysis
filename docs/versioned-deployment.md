# Versioned trial deployment

The stair release is web version **0.2.0**, deployment ID **1017-stairs**.

The trial service runs on `http://100.65.222.38:18082/`. The existing service on port 18081 remains unchanged. Access requires the same Tailscale network as the existing service.

The bottom-right selector switches between `1017-stairs` and `0804b` on the trial origin. A local preference cookie selects the static document directory; application data stays in browser storage. No analytics or external data transmission is added. Export the event as JSON when moving data from the old port to the trial port: browser storage is scoped by origin. The existing app's unsaved-change prompt also applies when switching releases.

Direct links:

- New version: `http://100.65.222.38:18082/stairs?version=1017-stairs`
- Previous version: `http://100.65.222.38:18082/?version=0804b`

`deploy/versioned/default.conf` serves both static builds and injects the selector from `picker.js`. Static hashed assets from both builds remain available, including when another browser tab switches versions. The release cookie accepts only the configured release IDs.

## Packaging

Prepare a Docker build context containing `deploy/versioned/{Dockerfile,default.conf,picker.js}` and the new exported Next.js build as `site/`. The base image `indoor-o-route-analysis:0804b` supplies the previous static release. Build the image as `indoor-o-route-analysis:1017-stairs` and run:

```sh
docker run -d --name indoor-o-stairs-1017 --restart unless-stopped \
  -p 100.65.222.38:18082:8080 indoor-o-route-analysis:1017-stairs
```

The initial release was built from repository HEAD plus the stair feature changes and the existing HTTP `crypto.randomUUID` compatibility fix required for imports on the Tailscale HTTP origin, in an isolated staging directory. It excludes unrelated uncommitted work and private attachment examples. The build uses `next build --webpack` because the staging build shares installed dependencies outside its workspace root. Version metadata is available at `/version.json` in the new release; `/__releases/current` reports the selected deployment ID.

To withdraw this trial, stop `indoor-o-stairs-1017`. The original `indoor-o-route-analysis` container and image remain available and unchanged.

## Release verification

Validated production HTML and version metadata, switching new → old → new, preference persistence, zero browser runtime errors, and importing the configured Wangfujing event followed by A1 highlighting with zero stair diagnostics. Run `TEST_EVENT_FILE=/absolute/path/to/event.json node deploy/versioned/verify.mjs` to repeat this browser check. The fixture is imported locally by the browser and is not included in the hosted static files.
