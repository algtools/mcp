import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import pjson from "../package.json";

// Define our MCP agent with tools
export class MyMCP extends McpAgent<Env> {
	server = new McpServer({
		name: "algtools-mcp",
		version: pjson.version,
	});

	async init() {
		// CursorRules tool that performs AI search on autorag
		this.server.tool(
			"cursorRules",
			{
				query: z
					.string()
					.describe("The search query to find relevant cursor rules"),
			},
			async ({ query }) => {
				if (!this.env) {
					return {
						content: [
							{
								type: "text",
								text: "Error: Environment not initialized",
							},
						],
					};
				}

				try {
					const response = await fetch(
						"https://api.cloudflare.com/client/v4/accounts/31eafafb86927bf33ef3cf164fe6aa15/autorag/rags/algtools-cursor-rules-rag/ai-search",
						{
							method: "POST",
							headers: {
								"Content-Type": "application/json",
								Authorization: `Bearer ${this.env.AI_SEARCH_API_TOKEN}`,
							},
							body: JSON.stringify({ query }),
						},
					);

					if (!response.ok) {
						const errorText = await response.text();
						return {
							content: [
								{
									type: "text",
									text: `Error: Failed to search cursor rules. Status: ${response.status}, Message: ${errorText}`,
								},
							],
						};
					}

					const data = await response.json();
					return {
						content: [
							{
								type: "text",
								text: JSON.stringify(data, null, 2),
							},
						],
					};
				} catch (error) {
					return {
						content: [
							{
								type: "text",
								text: `Error: Failed to search cursor rules. ${error instanceof Error ? error.message : String(error)}`,
							},
						],
					};
				}
			},
		);
	}
}

export default {
	fetch(request: Request, env: Env, ctx: ExecutionContext) {
		const url = new URL(request.url);

		if (url.pathname === "/sse" || url.pathname === "/sse/message") {
			return MyMCP.serveSSE("/sse").fetch(request, env, ctx);
		}

		if (url.pathname === "/mcp") {
			return MyMCP.serve("/mcp").fetch(request, env, ctx);
		}

		return new Response("Not found", { status: 404 });
	},
};
