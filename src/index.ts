import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import pjson from "../package.json";

// Type definitions for the stories.json structure
interface PropType {
	description?: string;
	control?: string;
	options?: string[];
}

interface StoryEntry {
	id: string;
	title: string;
	name?: string;
	importPath?: string;
	componentPath?: string;
	storiesImports?: string[];
	type?: string;
	tags?: string[];
	componentInfo?: {
		props?: Record<string, PropType>;
		description?: string | null;
	};
}

interface ComponentSummary {
	title: string;
	componentPath?: string;
	importPath?: string;
	description?: string | null;
	props?: Record<string, PropType>;
	storyCount: number;
	stories: Array<{ id: string; name: string }>;
	storybookUrl: string;
}

interface StoriesJsonData {
	entries?: Record<string, StoryEntry>;
	components?: Record<string, ComponentSummary>;
}

// Helper function to fetch stories from stories.json
async function fetchStoriesJson(): Promise<StoriesJsonData> {
	const response = await fetch("https://algtools.github.io/ui/stories.json");

	if (!response.ok) {
		throw new Error(`Could not fetch stories.json. Status: ${response.status}`);
	}

	const data = (await response.json()) as StoriesJsonData;
	return data;
}

// Helper function to find a matching component by name
function findMatchingComponent(
	storiesData: StoriesJsonData,
	componentName: string,
): ComponentSummary | null {
	if (!storiesData.components) {
		return null;
	}

	const componentNameLower = componentName.toLowerCase();

	// Try exact match on component title
	for (const [key, component] of Object.entries(storiesData.components)) {
		const titleLower = component.title.toLowerCase();
		const titleWithoutCategory = titleLower.split("/").pop() || "";

		if (
			titleLower === componentNameLower ||
			titleWithoutCategory === componentNameLower ||
			key.toLowerCase() === componentNameLower
		) {
			return component;
		}
	}

	// Try partial match
	for (const component of Object.values(storiesData.components)) {
		const titleLower = component.title.toLowerCase();
		const titleWithoutCategory = titleLower.split("/").pop() || "";

		if (
			titleLower.includes(componentNameLower) ||
			titleWithoutCategory.includes(componentNameLower)
		) {
			return component;
		}
	}

	return null;
}

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

		// AlgtoolsUI tool that fetches component information from stories.json
		this.server.tool(
			"algtoolsUI",
			{
				componentName: z
					.string()
					.optional()
					.describe(
						"Optional: The name of a specific component to get detailed information about (e.g., 'Button', 'Avatar', 'Dialog'). If not provided, returns a summary list of all available components.",
					),
			},
			async ({ componentName }) => {
				try {
					const storiesData = await fetchStoriesJson();

					// If a specific component is requested, get its details
					if (componentName) {
						const matchingComponent = findMatchingComponent(
							storiesData,
							componentName,
						);

						if (!matchingComponent) {
							const componentNames = Object.values(storiesData.components || {})
								.map((c) => c.title)
								.slice(0, 20)
								.join(", ");
							const totalCount = Object.keys(
								storiesData.components || {},
							).length;
							const moreCount =
								totalCount > 20 ? `... (${totalCount} total)` : "";

							return {
								content: [
									{
										type: "text",
										text: `Component "${componentName}" not found. Available components: ${componentNames}${moreCount}`,
									},
								],
							};
						}

						return {
							content: [
								{
									type: "text",
									text: JSON.stringify(matchingComponent, null, 2),
								},
							],
						};
					}

					// If no component name provided, return a summary of all components
					const componentsSummary = Object.entries(
						storiesData.components || {},
					).map(([_key, component]) => ({
						title: component.title,
						storyCount: component.storyCount,
						hasProps: Object.keys(component.props || {}).length > 0,
						componentPath: component.componentPath,
						storybookUrl: component.storybookUrl,
					}));

					return {
						content: [
							{
								type: "text",
								text: JSON.stringify(
									{
										totalComponents: componentsSummary.length,
										components: componentsSummary,
										note: "Use the 'componentName' parameter to get detailed information about a specific component, including its props, available stories, and usage examples.",
									},
									null,
									2,
								),
							},
						],
					};
				} catch (error) {
					return {
						content: [
							{
								type: "text",
								text: `Error: Failed to fetch component information from stories.json. ${error instanceof Error ? error.message : String(error)}. Please check if the stories.json is accessible at https://algtools.github.io/ui/stories.json`,
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
			let description = (paramSchema as any).description || "";
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
	<script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference@latest/dist/browser/standalone.js"></script>
</body>
</html>`;

// HTML content for the testing interface - embedded as string
const TEST_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>MCP Tools Tester</title>
	<style>
		* {
			margin: 0;
			padding: 0;
			box-sizing: border-box;
		}

		body {
			font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
			background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
			min-height: 100vh;
			padding: 20px;
		}

		.container {
			max-width: 1200px;
			margin: 0 auto;
			background: white;
			border-radius: 12px;
			box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
			overflow: hidden;
		}

		.header {
			background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
			color: white;
			padding: 30px;
			text-align: center;
		}

		.header h1 {
			font-size: 2rem;
			margin-bottom: 10px;
		}

		.header p {
			opacity: 0.9;
			font-size: 0.95rem;
		}

		.content {
			padding: 30px;
		}

		.tools-section {
			margin-bottom: 30px;
		}

		.section-title {
			font-size: 1.5rem;
			margin-bottom: 20px;
			color: #333;
			display: flex;
			align-items: center;
			gap: 10px;
		}

		.tool-card {
			background: #f8f9fa;
			border: 2px solid #e9ecef;
			border-radius: 8px;
			padding: 20px;
			margin-bottom: 20px;
			transition: all 0.3s ease;
		}

		.tool-card:hover {
			border-color: #667eea;
			box-shadow: 0 4px 12px rgba(102, 126, 234, 0.15);
		}

		.tool-name {
			font-size: 1.25rem;
			font-weight: 600;
			color: #667eea;
			margin-bottom: 10px;
		}

		.tool-description {
			color: #666;
			margin-bottom: 15px;
			line-height: 1.6;
		}

		.param-group {
			margin-bottom: 15px;
		}

		.param-label {
			display: block;
			font-weight: 500;
			margin-bottom: 5px;
			color: #333;
		}

		.param-input {
			width: 100%;
			padding: 10px;
			border: 2px solid #e9ecef;
			border-radius: 6px;
			font-size: 0.95rem;
			transition: border-color 0.3s ease;
		}

		.param-input:focus {
			outline: none;
			border-color: #667eea;
		}

		.param-optional {
			color: #999;
			font-size: 0.85rem;
			font-weight: normal;
		}

		.btn {
			background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
			color: white;
			border: none;
			padding: 12px 24px;
			border-radius: 6px;
			font-size: 1rem;
			font-weight: 500;
			cursor: pointer;
			transition: transform 0.2s ease, box-shadow 0.2s ease;
		}

		.btn:hover {
			transform: translateY(-2px);
			box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
		}

		.btn:active {
			transform: translateY(0);
		}

		.btn:disabled {
			opacity: 0.6;
			cursor: not-allowed;
			transform: none;
		}

		.btn-secondary {
			background: #6c757d;
		}

		.result-section {
			margin-top: 30px;
		}

		.result-box {
			background: #f8f9fa;
			border: 2px solid #e9ecef;
			border-radius: 8px;
			padding: 20px;
			max-height: 500px;
			overflow-y: auto;
		}

		.result-header {
			display: flex;
			justify-content: space-between;
			align-items: center;
			margin-bottom: 15px;
		}

		.result-title {
			font-weight: 600;
			color: #333;
		}

		.result-content {
			background: white;
			border: 1px solid #e9ecef;
			border-radius: 6px;
			padding: 15px;
			font-family: 'Courier New', monospace;
			font-size: 0.9rem;
			white-space: pre-wrap;
			word-wrap: break-word;
		}

		.loading {
			display: inline-block;
			width: 20px;
			height: 20px;
			border: 3px solid rgba(255, 255, 255, 0.3);
			border-radius: 50%;
			border-top-color: white;
			animation: spin 1s ease-in-out infinite;
		}

		@keyframes spin {
			to { transform: rotate(360deg); }
		}

		.error {
			color: #dc3545;
			background: #f8d7da;
			border-color: #f5c6cb;
		}

		.success {
			color: #155724;
			background: #d4edda;
			border-color: #c3e6cb;
		}

		.status-badge {
			display: inline-block;
			padding: 4px 12px;
			border-radius: 12px;
			font-size: 0.85rem;
			font-weight: 500;
		}

		.status-connected {
			background: #d4edda;
			color: #155724;
		}

		.status-disconnected {
			background: #f8d7da;
			color: #721c24;
		}

		.refresh-btn {
			margin-left: 10px;
		}
	</style>
</head>
<body>
	<div class="container">
		<div class="header">
			<h1>🔧 MCP Tools Tester</h1>
			<p>Test and interact with your MCP server tools</p>
		</div>
		<div class="content">
			<div class="tools-section">
				<div class="section-title">
					<span>Available Tools</span>
					<span class="status-badge" id="statusBadge">Checking...</span>
					<button class="btn btn-secondary refresh-btn" onclick="loadTools()" id="refreshBtn">
						🔄 Refresh
					</button>
				</div>
				<div id="toolsContainer">
					<p>Loading tools...</p>
				</div>
			</div>

			<div class="result-section" id="resultSection" style="display: none;">
				<div class="section-title">Result</div>
				<div class="result-box">
					<div class="result-header">
						<span class="result-title" id="resultTitle">Tool Execution Result</span>
					</div>
					<div class="result-content" id="resultContent"></div>
				</div>
			</div>
		</div>
	</div>

	<script>
		const MCP_ENDPOINT = '/mcp';
		let tools = [];

		async function mcpRequest(method, params = {}) {
			const response = await fetch(MCP_ENDPOINT, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					jsonrpc: '2.0',
					id: Date.now(),
					method,
					params,
				}),
			});

			if (!response.ok) {
				throw new Error(\`HTTP error! status: \${response.status}\`);
			}

			const data = await response.json();
			if (data.error) {
				throw new Error(data.error.message || 'MCP error');
			}
			return data.result;
		}

		async function loadTools() {
			const statusBadge = document.getElementById('statusBadge');
			const refreshBtn = document.getElementById('refreshBtn');
			const toolsContainer = document.getElementById('toolsContainer');

			try {
				statusBadge.textContent = 'Connecting...';
				statusBadge.className = 'status-badge';
				refreshBtn.disabled = true;

				// Initialize the MCP connection
				await mcpRequest('initialize', {
					protocolVersion: '2024-11-05',
					capabilities: {},
					clientInfo: {
						name: 'MCP Tools Tester',
						version: '1.0.0',
					},
				});

				// List available tools
				const result = await mcpRequest('tools/list');
				tools = result.tools || [];

				statusBadge.textContent = \`Connected (\${tools.length} tools)\`;
				statusBadge.className = 'status-badge status-connected';

				renderTools();
			} catch (error) {
				statusBadge.textContent = 'Disconnected';
				statusBadge.className = 'status-badge status-disconnected';
				toolsContainer.innerHTML = \`<p style="color: #dc3545;">Error loading tools: \${error.message}</p>\`;
			} finally {
				refreshBtn.disabled = false;
			}
		}

		function renderTools() {
			const toolsContainer = document.getElementById('toolsContainer');

			if (tools.length === 0) {
				toolsContainer.innerHTML = '<p>No tools available.</p>';
				return;
			}

			toolsContainer.innerHTML = tools.map(tool => {
				const params = tool.inputSchema?.properties || {};
				const required = tool.inputSchema?.required || [];

				const paramInputs = Object.entries(params).map(([name, schema]) => {
					const isRequired = required.includes(name);
					const description = schema.description || '';
					const type = schema.type || 'string';

					let inputHtml = '';
					if (type === 'boolean') {
						inputHtml = \`
							<select class="param-input" id="param-\${tool.name}-\${name}">
								<option value="">-- Select --</option>
								<option value="true">true</option>
								<option value="false">false</option>
							</select>
						\`;
					} else if (schema.enum) {
						inputHtml = \`
							<select class="param-input" id="param-\${tool.name}-\${name}">
								<option value="">-- Select --</option>
								\${schema.enum.map(opt => \`<option value="\${opt}">\${opt}</option>\`).join('')}
							</select>
						\`;
					} else {
						inputHtml = \`<input type="text" class="param-input" id="param-\${tool.name}-\${name}" placeholder="\${description}">\`;
					}

					return \`
						<div class="param-group">
							<label class="param-label">
								\${name}
								\${!isRequired ? '<span class="param-optional">(optional)</span>' : ''}
							</label>
							\${inputHtml}
							\${description ? \`<small style="color: #666; display: block; margin-top: 5px;">\${description}</small>\` : ''}
						</div>
					\`;
				}).join('');

				return \`
					<div class="tool-card">
						<div class="tool-name">\${tool.name}</div>
						<div class="tool-description">\${tool.description || 'No description available'}</div>
						\${paramInputs}
						<button class="btn" onclick="callTool('\${tool.name}')">
							🚀 Execute Tool
						</button>
					</div>
				\`;
			}).join('');
		}

		async function callTool(toolName) {
			const tool = tools.find(t => t.name === toolName);
			if (!tool) return;

			const resultSection = document.getElementById('resultSection');
			const resultContent = document.getElementById('resultContent');
			const resultTitle = document.getElementById('resultTitle');
			const btn = event.target;

			// Collect parameters
			const params = {};
			const toolParams = tool.inputSchema?.properties || {};
			const required = tool.inputSchema?.required || [];

			for (const [name] of Object.entries(toolParams)) {
				const input = document.getElementById(\`param-\${toolName}-\${name}\`);
				if (input) {
					const value = input.value.trim();
					if (value) {
						// Try to parse as JSON if it looks like JSON
						try {
							params[name] = JSON.parse(value);
						} catch {
							// If not JSON, use as string
							if (input.tagName === 'SELECT') {
								params[name] = value === 'true' ? true : value === 'false' ? false : value;
							} else {
								params[name] = value;
							}
						}
					} else if (required.includes(name)) {
						alert(\`Parameter "\${name}" is required\`);
						return;
					}
				}
			}

			// Show loading state
			resultSection.style.display = 'block';
			resultTitle.textContent = \`Executing \${toolName}...\`;
			resultContent.textContent = 'Loading...';
			resultContent.className = 'result-content';
			btn.disabled = true;
			btn.innerHTML = '<span class="loading"></span> Executing...';

			try {
				const result = await mcpRequest('tools/call', {
					name: toolName,
					arguments: params,
				});

				// Format the result
				let resultText = '';
				if (result.content && Array.isArray(result.content)) {
					resultText = result.content.map(item => {
						if (item.type === 'text') {
							return item.text;
						}
						return JSON.stringify(item, null, 2);
					}).join('\\n\\n');
				} else {
					resultText = JSON.stringify(result, null, 2);
				}

				resultTitle.textContent = \`Result: \${toolName}\`;
				resultContent.textContent = resultText;
				resultContent.className = 'result-content success';
			} catch (error) {
				resultTitle.textContent = \`Error: \${toolName}\`;
				resultContent.textContent = \`Error: \${error.message}\\n\\n\${error.stack || ''}\`;
				resultContent.className = 'result-content error';
			} finally {
				btn.disabled = false;
				btn.innerHTML = '🚀 Execute Tool';
			}
		}

		// Load tools on page load
		window.addEventListener('DOMContentLoaded', loadTools);
	</script>
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

		// Serve the simple testing interface (legacy)
		if (url.pathname === "/test") {
			return new Response(TEST_HTML, {
				headers: {
					"Content-Type": "text/html",
				},
			});
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
