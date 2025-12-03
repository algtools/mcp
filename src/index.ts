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
