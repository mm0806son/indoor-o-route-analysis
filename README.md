# Indoor Orienteering Route Analysis

This is an experimental web application for analyzing and optimizing indoor orienteering courses. It is intended to run 100% on the client side, with no server-side components. The application can be used as a web app, a desktop app, MCP server or command-line tools. The web app can be run locally, in a container or easily hosted on any server that supports static file hosting. 

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

Run difficulty analysis of all events in `./apps/web/public/examples` and outputs reports to `./analysis-output`:

```
pnpm batch-analysis
```

Generate data for training app:

```
pnpm generate-training-data 2023-02-04
```

Convert between JSON, IOF XML and CSV:

```
pnpm convert --help
pnpm convert <input> --format json|xml|csv [-o <output>]
```

Command line tool to analyse legs:

```
pnpm route-cli --help
```
