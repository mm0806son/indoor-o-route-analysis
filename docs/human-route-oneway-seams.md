# Human route directed corridors — 0.2.1

Human thinking now includes stairs reachable through unlabeled one-way corridors. Forward glances follow corridor direction; backward glances use incoming reachability. Both stair chains can also meet through a directed corridor. Final stitching verifies the actual walking path.

Bidirectional floor clusters remain unchanged: one-way corridors do not merge mutually unreachable regions. A cycle-safe region traversal extends each glance, while the existing corridor path search provides real distances and overlay paths. Only labeled stairs enter candidate lists and parent chains, so labels, stair counts, thinking effort, and playback segmentation retain their meaning.

Regression coverage includes corridors before/after/between stairs, multiple directed seams, cycles, multiple entrances, backward search, prohibited reverse travel, candidate paths, and RouteAnalyzer → effort/frame/overlay integration. Fixtures use synthetic coordinates and contain no private event data.

## Review release

- Web version: `0.2.1`
- Deployment ID: `1017-human-route`
- Fix branch: `fix/human-route-oneway-seams`
- Trial branch: `test/0.2.1-human-route`
- Trial URL: `http://100.65.222.38:18083/labs?version=1017-human-route`

The trial keeps `1017-stairs` and `0804b` available in the bottom-right version selector. The existing services on 18081 and 18082 are unaffected. Browser storage is origin-specific; export/import the event JSON when moving to port 18083.

The review build layers this patch and version metadata onto the existing 0.2.0 stair-release source snapshot, including its HTTP UUID compatibility fix. These pre-existing, uncommitted features are not part of the focused fix commit. The source snapshot is `/tmp/indoor-release-1017-stairs`; the patched build directory is `/tmp/indoor-release-1017-human-route`. Private event files are not packaged in the site.

Build the patched snapshot with `NEXT_TELEMETRY_DISABLED=1 pnpm --filter web exec next build --webpack`. Copy its `apps/web/out/` to `site/` beside the files in `deploy/versioned/`, then build `indoor-o-route-analysis:1017-human-route`. The Dockerfile uses the existing `indoor-o-route-analysis:1017-stairs` image to preserve both previous static releases and assets.

Run the image with:

```sh
docker run -d --name indoor-o-human-route-1017 --restart unless-stopped \
  -p 100.65.222.38:18083:8080 indoor-o-route-analysis:1017-human-route
```

Stop that container to withdraw the trial. Version selection persists locally, and `/__releases/current` reports the chosen release.
