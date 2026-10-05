# deep-water-tools MCP server

A stdio [Model Context Protocol](https://modelcontextprotocol.io) server that exposes The Tank's deal tools
(`market_size_lookup`, `valuation_calculator`, `comparable_deals_search`, `red_flag_scanner`, `portfolio_lookup`)
to any MCP client.

## Same permission matrix as the harness

Every tool takes `{ pitch_slug, agent }`. Before running, the server calls the harness's `checkTool(config, agent, tool)`
against the active config (CONFIG_V1 by default). A tool must be in `permissions[agent].tools` AND its data scope in
`permissions[agent].data`; otherwise the call returns `isError: true` with
`PERMISSION DENIED: <tool> requires <scope> access`. `portfolio_lookup` is therefore denied for every agent unless the
config grants it. An unknown slug returns `isError` with `Unknown pitch: <slug>`.

The server holds no policy of its own: it applies the harness's permission matrix to whichever agent the caller claims (see Trust boundary below).

## Trust boundary

The `agent` argument is asserted by the MCP client. The server enforces the permission matrix for whichever agent is
claimed, but this is NOT authentication: a client that wants portfolio data can simply claim to be an agent that has it.
A real deployment must bind the agent to the caller's identity or session, or expose one agent per server
(for example a server instance that hard-codes `agent = "market"`).

## Run

```bash
pnpm mcp
```

By default pitches come from the seed data. To read pitches and the active config from Supabase instead
(requires `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SECRET_KEY`):

```bash
THE_TANK_USE_DB=true NODE_OPTIONS=--conditions=react-server pnpm mcp
```

tsx does not load `.env.local`, so set the Supabase variables in the MCP client config's `env` block (or export them in the shell).

stdout is reserved for protocol messages; logs go to stderr.

## Claude Code

```bash
claude mcp add deep-water-tools -- pnpm --dir /absolute/path/to/agentic-human-loop-example mcp
```

## Claude Desktop

In `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "deep-water-tools": {
      "command": "pnpm",
      "args": ["--dir", "/absolute/path/to/agentic-human-loop-example", "mcp"]
    }
  }
}
```
