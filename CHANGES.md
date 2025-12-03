# MCP Server Update - AlgtoolsUI Integration

## Summary

Updated the MCP server to use `https://algtools.github.io/ui/stories.json` as the single source of truth for AlgtoolsUI component information.

## Changes Made

### 1. Updated Type Definitions (`src/index.ts`)

**Replaced:**
- `StorybookStory` interface
- `StorybookIndexData` interface
- `StorybookStoriesData` interface

**With:**
- `PropType` interface - Defines the structure of component props
- `StoryEntry` interface - Defines individual story entries from stories.json
- `ComponentSummary` interface - Defines aggregated component information
- `StoriesJsonData` interface - Defines the overall structure of stories.json

### 2. Refactored Data Fetching

**Before:**
- Fetched from `/index.json` endpoint
- Made additional API calls to `/api/stories/{id}` for details
- Filtered out docs entries manually
- Relied on Storybook's internal API structure

**After:**
- Fetches directly from `https://algtools.github.io/ui/stories.json`
- All data is available in a single request
- Pre-processed component summaries available in the `components` field
- No additional API calls needed

### 3. Improved Component Matching

The new `findMatchingComponent()` function provides better search capabilities:

1. **Exact match** on:
   - Full component title (e.g., "Forms/Button")
   - Component name without category (e.g., "Button")
   - Component key

2. **Partial match** as fallback

### 4. Enhanced Tool Response

**When called without `componentName`:**
Returns a summary list with:
- `totalComponents`: Total number of available components
- `components`: Array of component summaries including:
  - `title`: Component title with category
  - `storyCount`: Number of available story examples
  - `hasProps`: Boolean indicating if component has documented props
  - `componentPath`: Path to component source file
  - `storybookUrl`: Direct link to Storybook

**When called with `componentName`:**
Returns detailed component information including:
- `title`: Component title
- `componentPath`: Path to component source
- `importPath`: Path to stories file
- `description`: Component description (if available)
- `props`: Detailed prop definitions with descriptions, types, and options
- `storyCount`: Number of available examples
- `stories`: List of all story examples with IDs and names
- `storybookUrl`: Direct link to Storybook

## Benefits

1. **Performance**: Single API call instead of multiple requests
2. **Reliability**: Uses pre-processed data instead of runtime API calls
3. **Completeness**: Access to all component metadata in one place
4. **Accuracy**: Uses the same data source as the Storybook UI
5. **Type Safety**: Improved TypeScript types without `any`

## Data Source Structure

The `stories.json` file contains two main sections:

1. **`entries`**: Raw story entries from Storybook (includes docs and stories)
2. **`components`**: Pre-aggregated component summaries with all related stories and props

The implementation primarily uses the `components` section for efficient lookups and comprehensive information.

## Testing

All checks pass:
- ✅ TypeScript type-check
- ✅ Biome linting (fixed all issues in src/index.ts)
- ✅ Code formatting

## Available Components

The stories.json currently includes **51 components** across categories:
- AI (AIImage, Tool, WebPreview)
- Buttons (Button, IconButton, LoadingButton)
- Forms (Checkbox, Input, Label, RadioGroup, Select, Switch, Textarea, Toggle, ToggleGroup)
- Layouts (Accordion, Card, Collapsible, ResizablePanels, ScrollArea, Separator, Skeleton, Tabs)
- Overlays (AlertDialog, ContextMenu, Dialog, Dropdown, HoverCard, Menubar, Popover, Sheet, Tooltip)
- Display (Avatar, Badge, Progress)
- Navigation (Breadcrumb, Carousel, Pagination, Sidebar, Table, Command, NavigationMenu, Slider, Calendar)
- Feedback (Alert, AspectRatio, Sonner)
