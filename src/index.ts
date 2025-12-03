import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import pjson from "../package.json";

// Type definitions for Storybook API responses
interface StorybookStory {
	name?: string;
	id: string;
	title: string;
	description?: string;
	parameters?: {
		docs?: {
			description?: string;
			source?: {
				code?: string;
			};
		};
		argTypes?: Record<string, any>;
	};
	argTypes?: Record<string, any>;
}

interface StorybookStoriesData {
	stories?: Record<string, StorybookStory>;
}

// Helper function to fetch stories from Storybook
async function fetchStoriesFromStorybook(
	baseUrl: string,
): Promise<StorybookStoriesData> {
	const storiesResponse = await fetch(`${baseUrl}/api/stories.json`);
	
	if (!storiesResponse.ok) {
		// Fallback: try the stories API endpoint
		const fallbackResponse = await fetch(`${baseUrl}/api/stories`);
		if (!fallbackResponse.ok) {
			throw new Error(
				`Could not fetch stories from Storybook. Status: ${storiesResponse.status}`,
			);
		}
		return (await fallbackResponse.json()) as StorybookStoriesData;
	}
	
	return (await storiesResponse.json()) as StorybookStoriesData;
}

// Helper function to find a matching story by component name
function findMatchingStory(
	storiesData: StorybookStoriesData,
	componentName: string,
): StorybookStory | null {
	const stories = Object.values(storiesData.stories || {});
	const componentLower = componentName.toLowerCase();
	
	return (
		stories.find((story) => {
			const storyName = story.name?.toLowerCase() || "";
			const storyId = story.id?.toLowerCase() || "";
			return (
				storyName.includes(componentLower) ||
				storyId.includes(componentLower)
			);
		}) || null
	);
}

interface ComponentInfo {
	name?: string;
	id: string;
	title: string;
	description?: string;
	props?: Record<string, any>;
	examples?: string;
	storybookUrl: string;
	note?: string;
}

// Helper function to get component details
async function getComponentDetails(
	baseUrl: string,
	matchingStory: StorybookStory,
): Promise<ComponentInfo> {
	const storyDetailResponse = await fetch(
		`${baseUrl}/api/stories/${matchingStory.id}`,
	);
	
	if (storyDetailResponse.ok) {
		const storyDetail = (await storyDetailResponse.json()) as StorybookStory;
		
		return {
			name: storyDetail.name || matchingStory.name,
			id: storyDetail.id || matchingStory.id,
			title: storyDetail.title || matchingStory.title,
			description:
				storyDetail.description ||
				storyDetail.parameters?.docs?.description ||
				"",
			props:
				storyDetail.parameters?.argTypes || storyDetail.argTypes || {},
			examples: storyDetail.parameters?.docs?.source?.code || "",
			storybookUrl: `${baseUrl}/?path=/story/${storyDetail.id || matchingStory.id}`,
		};
	}
	
	// If detail fetch fails, return basic info
	return {
		name: matchingStory.name,
		id: matchingStory.id,
		title: matchingStory.title,
		storybookUrl: `${baseUrl}/?path=/story/${matchingStory.id}`,
		note: "Detailed props information could not be fetched. Visit the Storybook URL for full details.",
	};
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

		// AlgtoolsUI tool that fetches component information from Storybook
		this.server.tool(
			"algtoolsUI",
			{
				componentName: z
					.string()
					.optional()
					.describe(
						"Optional: The name of a specific component to get detailed information about. If not provided, returns a list of all available components.",
					),
			},
			async ({ componentName }) => {
				try {
					const storybookBaseUrl = "https://algtools.github.io/ui";
					const storiesData = await fetchStoriesFromStorybook(
						storybookBaseUrl,
					);
					
					// If a specific component is requested, get its details
					if (componentName) {
						const matchingStory = findMatchingStory(
							storiesData,
							componentName,
						);
						
						if (!matchingStory) {
							const allStories = Object.values(
								storiesData.stories || {},
							);
							const componentNames = allStories
								.map((s) => s.name || s.id)
								.slice(0, 20)
								.join(", ");
							const moreCount =
								allStories.length > 20
									? `... (${allStories.length} total)`
									: "";
							
							return {
								content: [
									{
										type: "text",
										text: `Component "${componentName}" not found. Available components: ${componentNames}${moreCount}`,
									},
								],
							};
						}
						
						const componentInfo = await getComponentDetails(
							storybookBaseUrl,
							matchingStory,
						);
						
						return {
							content: [
								{
									type: "text",
									text: JSON.stringify(componentInfo, null, 2),
								},
							],
						};
					}
					
					// If no component name provided, list all available components
					const stories = Object.values(storiesData.stories || {});
					const componentsList = stories.map((story) => ({
						name: story.name || story.id,
						id: story.id,
						title: story.title,
						storybookUrl: `${storybookBaseUrl}/?path=/story/${story.id}`,
					}));
					
					return {
						content: [
							{
								type: "text",
								text: JSON.stringify(
									{
										totalComponents: componentsList.length,
										components: componentsList,
										note: "Use the 'componentName' parameter to get detailed information about a specific component, including its props and usage examples.",
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
								text: `Error: Failed to fetch component information from Storybook. ${error instanceof Error ? error.message : String(error)}. Please check if the Storybook is accessible at https://algtools.github.io/ui`,
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
