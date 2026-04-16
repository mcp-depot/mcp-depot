# Composite Tools

Composite Tools allow you to chain multiple API calls into a single MCP tool. When Claude calls a composite tool, it executes each step in sequence, passing results from one step to the next.

## When to Use

**Without Composite Tools:**
- Claude calls `get_issue_transitions` to find the right transition ID
- Claude calls `set_issue_status` with the transition ID
- Two separate tool calls, Claude must coordinate them

**With Composite Tools:**
- Claude calls `set_jira_status(issueId, status)` 
- Toolshed automatically fetches transitions, finds the matching ID, and applies the transition
- Single tool call, Toolshed handles the complexity

## How It Works

1. **Define Inputs** - What parameters Claude will pass in
2. **Add Steps** - Chain together tools from your integration  
3. **Map Parameters** - Connect each tool's inputs to either Claude inputs or previous step results
4. **Save & Use** - The composite tool appears in Claude's available tools

## Creating a Composite Tool

### 1. Navigate to an Integration

Go to an integration's Tools page. Click **"+ New Composite Tool"**.

### 2. Name Your Tool

Give it a clear name and description that Claude will understand:
- **Name**: `Get Jira Issue with Transitions`
- **Description**: Fetches a Jira issue and lists available status transitions

### 3. Add Steps

Click on tools in the left panel to add them as steps. Steps execute in order.

Example: "Get Issue Details" → "Get Transitions"

### 4. Configure Parameter Mappings

For each step, choose where each parameter comes from:

| Source | When to Use |
|--------|------------|
| **Claude Input** | The parameter value comes from what Claude passes to the tool |
| **Fixed Value** | Always use the same value (e.g., a constant) |
| **Previous Step** | Use data from an earlier step's response |

### 5. Save

Click **Save**. Your composite tool is now available to Claude.

## Parameter Mapping Examples

### Example 1: Simple Pass-Through

```
Claude Input: issueKey = "PROJ-123"
Step 1: Get Issue (uses issueKey from Claude)
```

Mapping: `issueKey` → Claude Input

### Example 2: Chain Results

```
Claude Input: issueKey = "PROJ-123"
Step 1: Get Issue → returns { id: "10001", key: "PROJ-123", ... }
Step 2: Get Comments (needs issueId from Step 1)
```

Mapping: `issueId` → Previous Step Result (from Get Issue)

### Example 3: Mixed

```
Claude Input: projectKey = "PROJ"
Step 1: Search Issues (uses projectKey)
         → returns { issues: [{ id: "10001", key: "PROJ-123" }, ...] }
Step 2: Get Issue Details (uses id from Step 1)
```

## Response Extractors

Response Extractors let you pull specific values from an API response to use in subsequent steps.

### Example

Step 1 returns:
```json
{
  "transitions": [
    {"id": "3", "name": "Done", "to": {"name": "Done"}},
    {"id": "4", "name": "In Progress", "to": {"name": "In Progress"}}
  ]
}
```

You want to find the transition with `name: "Done"`. Add an extractor:

| Field | Value |
|-------|-------|
| Name | `doneTransitionId` |
| Array Path | `transitions` |
| Filter Field | `name` |
| Filter Value | `Done` |
| Select Field | `id` |

Now in Step 2, you can use `{{steps.step_1.doneTransitionId}}` to get value `"3"`.

## Tips

1. **Start Simple** - Begin with 2-3 steps, add more as needed
2. **Clear Names** - Use descriptive step labels like "Get Issue Details" not "Step 1"
3. **Test First** - Test each underlying tool individually before combining
4. **Think from Claude's Perspective** - What does Claude need to know this tool does?

## Troubleshooting

### "integrationId is not allowed"
Make sure you're on the latest version. If persists, try creating from the integration's Tools page.

### Tool Not Appearing in Claude
- Check the tool is saved and active
- Try refreshing Claude's tool list
- Verify the integration is active

### Step Failing
- Check each individual tool works first
- Verify parameter mappings are correct
- Check the response format matches what extractors expect

## Best Practices

1. **Single Responsibility** - Each composite tool should do one focused task
2. **Error Handling** - Keep steps minimal so failures are clear
3. **Documentation** - Write clear descriptions so Claude understands when to use the tool
4. **Testing** - Use the Test button to verify your tool works before deploying
