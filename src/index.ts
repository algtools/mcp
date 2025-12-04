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

		// AlgtoolsUI tool that performs AI search on autorag
		this.server.tool(
			"algtoolsUI",
			{
				query: z
					.string()
					.describe(
						"The search query to find relevant AlgtoolsUI component information",
					),
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
						"https://api.cloudflare.com/client/v4/accounts/31eafafb86927bf33ef3cf164fe6aa15/autorag/rags/algtools-ui-stories-rag/ai-search",
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
									text: `Error: Failed to search AlgtoolsUI components. Status: ${response.status}, Message: ${errorText}`,
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
								text: `Error: Failed to search AlgtoolsUI components. ${error instanceof Error ? error.message : String(error)}`,
							},
						],
					};
				}
			},
		);
	}
}

// Helper function to convert Zod schema to OpenAPI schema
function zodToOpenAPISchema(zodSchema: z.ZodTypeAny): any {
	if (zodSchema instanceof z.ZodString) {
		return { type: "string" };
	}
	if (zodSchema instanceof z.ZodNumber) {
		return { type: "number" };
	}
	if (zodSchema instanceof z.ZodBoolean) {
		return { type: "boolean" };
	}
	if (zodSchema instanceof z.ZodOptional) {
		return zodToOpenAPISchema(zodSchema._def.innerType);
	}
	if (zodSchema instanceof z.ZodObject) {
		const properties: Record<string, any> = {};
		const required: string[] = [];
		for (const [key, value] of Object.entries(zodSchema.shape)) {
			properties[key] = zodToOpenAPISchema(value as z.ZodTypeAny);
			if (!(value instanceof z.ZodOptional)) {
				required.push(key);
			}
		}
		return {
			type: "object",
			properties,
			...(required.length > 0 && { required }),
		};
	}
	if (zodSchema instanceof z.ZodArray) {
		return {
			type: "array",
			items: zodToOpenAPISchema(zodSchema._def.type),
		};
	}
	return { type: "string" };
}

// Generate OpenAPI spec from MCP tools
async function generateOpenAPISpec(
	request: Request,
	env: Env,
): Promise<Response> {
	// Get tools by making a request to the MCP server
	const mcpRequest = new Request(new URL("/mcp", request.url), {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			jsonrpc: "2.0",
			id: 1,
			method: "tools/list",
			params: {},
		}),
	});

	const mcpResponse = await MyMCP.serve("/mcp").fetch(
		mcpRequest,
		env,
		{} as ExecutionContext,
	);
	const mcpData = (await mcpResponse.json()) as {
		result?: {
			tools?: Array<{ name: string; description?: string; inputSchema?: any }>;
		};
		error?: { message: string };
	};
	const tools = mcpData.result?.tools || [];

	const baseUrl = new URL(request.url).origin;
	const openAPISpec = {
		openapi: "3.1.0",
		info: {
			title: "MCP Tools API",
			version: pjson.version,
			description: "API documentation for MCP (Model Context Protocol) tools",
		},
		servers: [
			{
				url: baseUrl,
				description: "MCP Server",
			},
		],
		paths: {} as Record<string, any>,
	};

	// Add a generic MCP endpoint
	openAPISpec.paths["/mcp"] = {
		post: {
			summary: "MCP JSON-RPC Endpoint",
			description: "Execute MCP tools using JSON-RPC protocol",
			operationId: "mcpRequest",
			requestBody: {
				required: true,
				content: {
					"application/json": {
						schema: {
							type: "object",
							properties: {
								jsonrpc: {
									type: "string",
									enum: ["2.0"],
									default: "2.0",
								},
								method: {
									type: "string",
									enum: ["tools/list", "tools/call", "initialize"],
									description: "MCP method to call",
								},
								params: {
									type: "object",
									description: "Method parameters",
								},
								id: {
									type: "number",
									description: "Request ID",
								},
							},
							required: ["jsonrpc", "method", "id"],
						},
					},
				},
			},
			responses: {
				"200": {
					description: "Successful response",
					content: {
						"application/json": {
							schema: {
								type: "object",
							},
						},
					},
				},
			},
		},
	};

	// Add individual tool endpoints
	for (const tool of tools) {
		const toolName = tool.name;
		const path = `/tools/${toolName}`;
		const inputSchema = tool.inputSchema || {};
		const properties = inputSchema.properties || {};
		const required = inputSchema.required || [];

		const requestBodySchema: Record<string, any> = {
			type: "object",
			properties: {},
		};

		// Build example object
		const example: Record<string, any> = {};

		for (const [paramName, paramSchema] of Object.entries(properties)) {
			// Handle Zod schema objects
			let schemaType = "string";
			const description = (paramSchema as any).description || "";
			let exampleValue: any = "example-value";

			// Try to infer type from Zod schema
			if ((paramSchema as any).type) {
				schemaType = (paramSchema as any).type;
				if (schemaType === "boolean") exampleValue = true;
				else if (schemaType === "number") exampleValue = 0;
			} else if ((paramSchema as any)._def) {
				// It's a Zod schema, try to convert it
				try {
					const zodSchema = paramSchema as z.ZodTypeAny;
					const openApiSchema = zodToOpenAPISchema(zodSchema);

					// Set example based on type
					if (openApiSchema.type === "boolean") exampleValue = true;
					else if (openApiSchema.type === "number") exampleValue = 0;
					else if (openApiSchema.type === "array") exampleValue = [];

					requestBodySchema.properties[paramName] = {
						...openApiSchema,
						description,
						example: exampleValue,
					};

					// Add to example if required
					if (required.includes(paramName)) {
						example[paramName] = exampleValue;
					}
					continue;
				} catch {
					// Fallback to string
				}
			}

			requestBodySchema.properties[paramName] = {
				type: schemaType,
				description,
				example: exampleValue,
			};

			if (required.includes(paramName)) {
				example[paramName] = exampleValue;
			}
		}

		if (required.length > 0) {
			requestBodySchema.required = required;
		}

		openAPISpec.paths[path] = {
			post: {
				summary: tool.description || `Execute ${toolName} tool`,
				description:
					tool.description || `Call the ${toolName} MCP tool via JSON-RPC`,
				operationId: `call_${toolName}`,
				tags: [toolName],
				requestBody: {
					required: true,
					content: {
						"application/json": {
							schema: requestBodySchema,
							example,
						},
					},
				},
				responses: {
					"200": {
						description: "Tool execution result",
						content: {
							"application/json": {
								schema: {
									type: "object",
									properties: {
										jsonrpc: { type: "string", example: "2.0" },
										id: { type: "number", example: 1 },
										result: {
											type: "object",
											properties: {
												content: {
													type: "array",
													items: {
														type: "object",
														properties: {
															type: { type: "string", example: "text" },
															text: {
																type: "string",
																example: "Tool execution result",
															},
														},
													},
												},
											},
										},
									},
								},
							},
						},
					},
					"400": {
						description: "Bad request",
						content: {
							"application/json": {
								schema: {
									type: "object",
									properties: {
										jsonrpc: { type: "string" },
										id: { type: "number" },
										error: {
											type: "object",
											properties: {
												code: { type: "number" },
												message: { type: "string" },
											},
										},
									},
								},
							},
						},
					},
				},
			},
		};
	}

	return new Response(JSON.stringify(openAPISpec, null, 2), {
		headers: {
			"Content-Type": "application/json",
		},
	});
}

// Scalar API Reference HTML
const SCALAR_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>MCP Tools API Reference</title>
	<style>
		body {
			margin: 0;
			padding: 0;
		}
	</style>
</head>
<body>
	<script
		id="api-reference"
		data-configuration='{
			"theme": "purple",
			"layout": "modern",
			"spec": {
				"url": "/openapi.json"
			},
			"proxy": "/mcp",
			"hideDownloadButton": false,
			"hideModels": false,
			"hideSchema": false
		}'
	></script>
	<script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference@1.40.0/dist/browser/standalone.js"></script>
</body>
</html>`;

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext) {
		const url = new URL(request.url);

		// Serve Scalar API Reference (main interface)
		if (url.pathname === "/" || url.pathname === "/docs") {
			return new Response(SCALAR_HTML, {
				headers: {
					"Content-Type": "text/html",
				},
			});
		}

		// Serve OpenAPI spec
		if (url.pathname === "/openapi.json") {
			return generateOpenAPISpec(request, env);
		}

		if (url.pathname === "/sse" || url.pathname === "/sse/message") {
			return MyMCP.serveSSE("/sse").fetch(request, env, ctx);
		}

		// Proxy tool endpoints to MCP JSON-RPC
		if (url.pathname.startsWith("/tools/")) {
			const toolName = url.pathname.replace("/tools/", "");
			if (request.method === "POST") {
				try {
					const body = await request.json();
					// Convert to MCP JSON-RPC format
					const mcpRequest = new Request(new URL("/mcp", request.url), {
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({
							jsonrpc: "2.0",
							id: Date.now(),
							method: "tools/call",
							params: {
								name: toolName,
								arguments: body,
							},
						}),
					});
					return MyMCP.serve("/mcp").fetch(mcpRequest, env, ctx);
				} catch (error) {
					return new Response(
						JSON.stringify({
							jsonrpc: "2.0",
							id: null,
							error: {
								code: -32700,
								message: `Parse error: ${error instanceof Error ? error.message : String(error)}`,
							},
						}),
						{
							status: 400,
							headers: { "Content-Type": "application/json" },
						},
					);
				}
			}
		}

		if (url.pathname === "/mcp") {
			return MyMCP.serve("/mcp").fetch(request, env, ctx);
		}

		return new Response("Not found", { status: 404 });
	},
};
