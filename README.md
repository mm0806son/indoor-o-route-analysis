# Indoor Orienteering Route Analysis

This is an experimental web application for analyzing and optimizing indoor orienteering courses. It is intended to run 100% on the client side, with no server-side components. The application can be used as a web app, a desktop app, MCP server or command-line tools. The web app can be run locally, in a container or easily hosted on any server that supports static file hosting. 

## Stair planning

Use **Stairs** after Graph Editor to annotate up/down stair nodes, connect matching adjacent floors without dragging, and highlight the same staircase across the map. Configure the floor order in Stairs, Graph Editor or 3D Model. Course Setting includes the same stair selector. [Requirements and workflow](docs/stair-view-requirements.md). [Versioned trial deployment](docs/versioned-deployment.md).

## Post-race publishing

Use **File → 赛后发布…** (Alt+Shift+P) to import a Course Setting JSON file, select public courses and recommended routes, and prepare a publication bundle. The separate athlete viewer supports mobile maps, route choices, local personal routes, and synthetic-coordinate GPX export. A dedicated static build keeps the public site separate from the editor. See the [publishing guide](docs/post-race-publishing-guide.md) and [requirements](docs/post-race-publishing-requirements.md). Cloud hosting and QuickRoute / Headcam O compatibility still require deployment and external acceptance testing.

## Contributing

The best way to contribute is to create issues in the GitHub repo with specific feature requests or bug reports. 

## How to run the application

To run the web app locally in development mode:

```
pnpm install
pnpm dev
```

To run the web app in a container:

```
docker build -t indoor-o-route-analysis .
docker run -p 3000:3000 indoor-o-route-analysis
```

## Command-line tools

Run difficulty analysis of all events in `./apps/web/public/examples` and outputs reports to `./output/route-analysis`:

```
pnpm analyse-all
```

Generate data for training app:

```
pnpm training 2023-02-04
```

Join runner splits with per-leg difficulty data:

```
pnpm splits
```

Run analyse-all, splits, and training in sequence:

```
pnpm update-all
```

Convert between JSON, IOF XML and CSV:

```
pnpm convert --help
pnpm convert <input> --format json|xml|csv [-o <output>]
```

Command line tool to analyse legs:

```
pnpm analyse --help
```

Render a video visualization of the route-finding algorithms (shortest route,
easiest route, all distinct routes) for a leg:

```
pnpm route-viz event.json --course "Course 1" --leg 3-4 --duration 20
```

For the MCP server, see the [README.md](apps/mcp-server/README.md)

## Agent skills

See the `skills` folder.

## Self-improvement loop

Claude Code can run autonomous improvement iterations on this repo via the `/self-improve [area]` skill (repeat with `/loop /self-improve`). Specialist agents live in `.claude/agents/`, the protocol in `.claude/skills/`, and the backlog/log in `TASKS.md`. Areas: algorithms, architecture, security, maintainability, docs, tests, features.
