# Building a Remote MCP Server on Cloudflare (Without Auth)

This example allows you to deploy a remote MCP server that doesn't require authentication on Cloudflare Workers. 

## Available Tools

This MCP server provides two main tools:

### 1. cursorRules
Performs AI-powered search on the Algenium team's cursor rules using Cloudflare AutoRAG.

**Parameters:**
- `query` (string): The search query to find relevant cursor rules

### 2. algtoolsUI
Performs AI-powered search on AlgtoolsUI component information using Cloudflare AutoRAG.

**Parameters:**
- `query` (string): The search query to find relevant AlgtoolsUI component information

## Get started: 

[![Deploy to Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/cloudflare/ai/tree/main/demos/remote-mcp-authless)

This will deploy your MCP server to a URL like: `remote-mcp-server-authless.<your-account>.workers.dev/sse`

Alternatively, you can use the command line below to get the remote MCP Server created on your local machine:
```bash
pnpm create cloudflare@latest -- my-mcp-server --template=cloudflare/ai/demos/remote-mcp-authless
```

## Customizing your MCP Server

To add your own [tools](https://developers.cloudflare.com/agents/model-context-protocol/tools/) to the MCP server, define each tool inside the `init()` method of `src/index.ts` using `this.server.tool(...)`. 

### Environment Variables and Secrets

This MCP server uses Cloudflare Workers environment variables and secrets. The environment is automatically passed to your Durable Object through the base class.

To access environment variables in your tools:
```typescript
async init() {
    this.server.tool("myTool", {}, async () => {
        // Access environment variables through this.env
        const apiToken = this.env.AI_SEARCH_API_TOKEN;
        // ...
    });
}
```

**Setting up secrets:**

For sensitive values like API tokens, use Wrangler secrets instead of plain environment variables:

```bash
# Set a secret
wrangler secret put AI_SEARCH_API_TOKEN

# For local development, create a .dev.vars file:
echo "AI_SEARCH_API_TOKEN=your-token-here" > .dev.vars
```

Don't forget to update the `worker-configuration.d.ts` file to include your environment variables in the `Env` interface:

```typescript
interface Env {
    MCP_OBJECT: DurableObjectNamespace<import("./src/index").MyMCP>;
    AI_SEARCH_API_TOKEN: string;
}
```

## Testing MCP Tools Online

This MCP server includes a comprehensive web interface for testing tools using **Scalar API Reference**.

### Access the Testing Interface

After deploying or running locally, visit:
- **Main Interface (Scalar)**: `http://localhost:8787/` or `http://localhost:8787/docs`
- **OpenAPI Spec**: `http://localhost:8787/openapi.json`

The Scalar interface provides:
- 📚 Interactive API documentation
- 🧪 Built-in request testing
- 📖 Schema exploration
- 🎨 Modern, professional UI

### Available Endpoints

- `/` or `/docs` - Scalar API Reference interface
- `/openapi.json` - OpenAPI 3.1 specification
- `/mcp` - MCP JSON-RPC endpoint
- `/tools/{toolName}` - Direct tool endpoints (proxied to MCP)

## Connect to Cloudflare AI Playground

You can connect to your MCP server from the Cloudflare AI Playground, which is a remote MCP client:

1. Go to https://playground.ai.cloudflare.com/
2. Enter your deployed MCP server URL (`remote-mcp-server-authless.<your-account>.workers.dev/sse`)
3. You can now use your MCP tools directly from the playground!

## Connect Claude Desktop to your MCP server

You can also connect to your remote MCP server from local MCP clients, by using the [mcp-remote proxy](https://www.npmjs.com/package/mcp-remote). 

To connect to your MCP server from Claude Desktop, follow [Anthropic's Quickstart](https://modelcontextprotocol.io/quickstart/user) and within Claude Desktop go to Settings > Developer > Edit Config.

Update with this configuration:

```json
{
  "mcpServers": {
    "calculator": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "http://localhost:8787/sse"  // or remote-mcp-server-authless.your-account.workers.dev/sse
      ]
    }
  }
}
```

Restart Claude and you should see the tools become available. 
