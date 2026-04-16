import type { ServerTemplate, TemplateToolConfig } from '@mcpbuilder/shared'

function tool(config: TemplateToolConfig): TemplateToolConfig {
  return config
}

export const serverTemplates: ServerTemplate[] = [
  {
    id: 'notion',
    name: 'Notion',
    description: 'Créez, mettez a jour et recherchez des pages et bases Notion.',
    category: 'productivity',
    icon: 'NotebookPen',
    baseUrl: 'https://api.notion.com/v1',
    authType: 'BEARER',
    authHelpUrl: 'https://developers.notion.com/docs/create-a-notion-integration',
    tools: [
      tool({
        name: 'create_page',
        description: 'Create a new Notion page in a target parent (page or database). Use this to draft structured notes, meeting summaries, or project updates.',
        httpMethod: 'POST',
        httpUrl: '/pages',
        parametersSchema: { type: 'object', properties: { parent: { type: 'object', description: 'Notion parent object (page_id or database_id).' }, properties: { type: 'object', description: 'Page properties following Notion API schema.' }, children: { type: 'array', description: 'Optional block children to initialize page content.' } }, required: ['parent', 'properties'] },
        headersConfig: [{ key: 'Notion-Version', value: '2022-06-28' }],
        isEnabled: true,
      }),
      tool({ name: 'update_page', description: 'Update metadata of an existing Notion page, such as status, assignee, due date, or title fields.', httpMethod: 'PATCH', httpUrl: '/pages/{page_id}', parametersSchema: { type: 'object', properties: { page_id: { type: 'string', description: 'Page ID to update.' }, properties: { type: 'object', description: 'Partial Notion page properties object.' }, archived: { type: 'boolean', description: 'Archive or unarchive the page.' } }, required: ['page_id'] }, headersConfig: [{ key: 'Notion-Version', value: '2022-06-28' }], isEnabled: true }),
      tool({ name: 'search_pages', description: 'Search pages and databases in Notion by text query. Useful for retrieval before read or update operations.', httpMethod: 'POST', httpUrl: '/search', parametersSchema: { type: 'object', properties: { query: { type: 'string', description: 'Search text to match title and content.' }, page_size: { type: 'integer', description: 'Max number of results to return.' }, start_cursor: { type: 'string', description: 'Cursor for pagination.' }, filter: { type: 'object', description: 'Optional Notion filter object (e.g. value=page).' } } }, headersConfig: [{ key: 'Notion-Version', value: '2022-06-28' }], isEnabled: true }),
      tool({ name: 'get_page', description: 'Fetch full metadata of a specific Notion page by its ID for context-aware reasoning and follow-up actions.', httpMethod: 'GET', httpUrl: '/pages/{page_id}', parametersSchema: { type: 'object', properties: { page_id: { type: 'string', description: 'Page ID to retrieve.' } }, required: ['page_id'] }, headersConfig: [{ key: 'Notion-Version', value: '2022-06-28' }], isEnabled: true }),
      tool({ name: 'create_database_entry', description: 'Insert a new row into a Notion database. Best for task creation, CRM records, and structured workflows.', httpMethod: 'POST', httpUrl: '/pages', parametersSchema: { type: 'object', properties: { database_id: { type: 'string', description: 'Target database ID.' }, properties: { type: 'object', description: 'Column values in Notion property format.' }, children: { type: 'array', description: 'Optional content blocks for the entry.' } }, required: ['database_id', 'properties'] }, headersConfig: [{ key: 'Notion-Version', value: '2022-06-28' }], isEnabled: true }),
      tool({ name: 'query_database', description: 'Query a Notion database with filters, sorting and pagination to find specific entries for analytics or automation.', httpMethod: 'POST', httpUrl: '/databases/{database_id}/query', parametersSchema: { type: 'object', properties: { database_id: { type: 'string', description: 'Database ID to query.' }, filter: { type: 'object', description: 'Notion filter expression.' }, sorts: { type: 'array', description: 'Sort descriptors.' }, page_size: { type: 'integer', description: 'Result size per page.' }, start_cursor: { type: 'string', description: 'Cursor token for pagination.' } }, required: ['database_id'] }, headersConfig: [{ key: 'Notion-Version', value: '2022-06-28' }], isEnabled: true }),
    ],
  },
  {
    id: 'github',
    name: 'GitHub',
    description: 'Automatisez depots, issues et pull requests.',
    category: 'developer',
    icon: 'Github',
    baseUrl: 'https://api.github.com',
    authType: 'BEARER',
    authHelpUrl: 'https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens',
    tools: [
      tool({ name: 'list_repos', description: 'List repositories for a given user or organization to inspect available projects and metadata.', httpMethod: 'GET', httpUrl: '/users/{owner}/repos', parametersSchema: { type: 'object', properties: { owner: { type: 'string', description: 'GitHub username or org.' }, per_page: { type: 'integer', description: 'Results per page.' }, page: { type: 'integer', description: 'Page index.' }, sort: { type: 'string', description: 'Sort field (created, updated, pushed, full_name).' } }, required: ['owner'] }, headersConfig: [{ key: 'Accept', value: 'application/vnd.github+json' }, { key: 'X-GitHub-Api-Version', value: '2022-11-28' }], isEnabled: true }),
      tool({ name: 'create_issue', description: 'Create an issue in a repository with optional body, labels, assignees and milestone for task tracking.', httpMethod: 'POST', httpUrl: '/repos/{owner}/{repo}/issues', parametersSchema: { type: 'object', properties: { owner: { type: 'string', description: 'Repository owner.' }, repo: { type: 'string', description: 'Repository name.' }, title: { type: 'string', description: 'Issue title.' }, body: { type: 'string', description: 'Issue details in Markdown.' }, labels: { type: 'array', description: 'Label names.' }, assignees: { type: 'array', description: 'GitHub usernames to assign.' } }, required: ['owner', 'repo', 'title'] }, headersConfig: [{ key: 'Accept', value: 'application/vnd.github+json' }, { key: 'X-GitHub-Api-Version', value: '2022-11-28' }], isEnabled: true }),
      tool({ name: 'get_issue', description: 'Fetch complete issue metadata and state to decide next actions in engineering workflows.', httpMethod: 'GET', httpUrl: '/repos/{owner}/{repo}/issues/{issue_number}', parametersSchema: { type: 'object', properties: { owner: { type: 'string' }, repo: { type: 'string' }, issue_number: { type: 'integer', description: 'Issue number.' } }, required: ['owner', 'repo', 'issue_number'] }, headersConfig: [{ key: 'Accept', value: 'application/vnd.github+json' }, { key: 'X-GitHub-Api-Version', value: '2022-11-28' }], isEnabled: true }),
      tool({ name: 'add_comment', description: 'Post a comment on an issue or pull request thread to provide updates, reviews, or bot-generated context.', httpMethod: 'POST', httpUrl: '/repos/{owner}/{repo}/issues/{issue_number}/comments', parametersSchema: { type: 'object', properties: { owner: { type: 'string' }, repo: { type: 'string' }, issue_number: { type: 'integer' }, body: { type: 'string', description: 'Comment body in Markdown.' } }, required: ['owner', 'repo', 'issue_number', 'body'] }, headersConfig: [{ key: 'Accept', value: 'application/vnd.github+json' }, { key: 'X-GitHub-Api-Version', value: '2022-11-28' }], isEnabled: true }),
      tool({ name: 'list_pull_requests', description: 'List pull requests for a repository to monitor delivery pipeline and review queues.', httpMethod: 'GET', httpUrl: '/repos/{owner}/{repo}/pulls', parametersSchema: { type: 'object', properties: { owner: { type: 'string' }, repo: { type: 'string' }, state: { type: 'string', description: 'open, closed, or all.' }, per_page: { type: 'integer' }, page: { type: 'integer' } }, required: ['owner', 'repo'] }, headersConfig: [{ key: 'Accept', value: 'application/vnd.github+json' }, { key: 'X-GitHub-Api-Version', value: '2022-11-28' }], isEnabled: true }),
      tool({ name: 'get_file_content', description: 'Retrieve file content at a branch or commit SHA. Useful for contextual code analysis and documentation generation.', httpMethod: 'GET', httpUrl: '/repos/{owner}/{repo}/contents/{path}', parametersSchema: { type: 'object', properties: { owner: { type: 'string' }, repo: { type: 'string' }, path: { type: 'string', description: 'File path in repo.' }, ref: { type: 'string', description: 'Branch, tag, or commit SHA.' } }, required: ['owner', 'repo', 'path'] }, headersConfig: [{ key: 'Accept', value: 'application/vnd.github+json' }, { key: 'X-GitHub-Api-Version', value: '2022-11-28' }], isEnabled: true }),
    ],
  },
  {
    id: 'airtable',
    name: 'Airtable',
    description: 'Manipulez vos bases Airtable en lecture et ecriture.',
    category: 'data',
    icon: 'Table',
    baseUrl: 'https://api.airtable.com/v0',
    authType: 'BEARER',
    authHelpUrl: 'https://support.airtable.com/docs/creating-and-using-api-keys-and-access-tokens',
    tools: [
      tool({ name: 'list_records', description: 'List records from an Airtable table with pagination, sorting and filtering formula support.', httpMethod: 'GET', httpUrl: '/{baseId}/{tableName}', parametersSchema: { type: 'object', properties: { baseId: { type: 'string' }, tableName: { type: 'string' }, maxRecords: { type: 'integer' }, pageSize: { type: 'integer' }, filterByFormula: { type: 'string' }, view: { type: 'string' }, offset: { type: 'string' } }, required: ['baseId', 'tableName'] }, headersConfig: [], isEnabled: true }),
      tool({ name: 'create_record', description: 'Create one or multiple Airtable records with field values. Ideal for CRM, tasks, or inventory ingestion.', httpMethod: 'POST', httpUrl: '/{baseId}/{tableName}', parametersSchema: { type: 'object', properties: { baseId: { type: 'string' }, tableName: { type: 'string' }, fields: { type: 'object', description: 'Single record fields.' }, records: { type: 'array', description: 'Batch records array [{fields:{...}}].' }, typecast: { type: 'boolean', description: 'Enable Airtable type coercion.' } }, required: ['baseId', 'tableName'] }, headersConfig: [], isEnabled: true }),
      tool({ name: 'update_record', description: 'Update or replace an Airtable record by record ID with precise field-level changes.', httpMethod: 'PATCH', httpUrl: '/{baseId}/{tableName}/{recordId}', parametersSchema: { type: 'object', properties: { baseId: { type: 'string' }, tableName: { type: 'string' }, recordId: { type: 'string' }, fields: { type: 'object', description: 'Fields to update.' }, typecast: { type: 'boolean' } }, required: ['baseId', 'tableName', 'recordId', 'fields'] }, headersConfig: [], isEnabled: true }),
      tool({ name: 'search_records', description: 'Search records using Airtable formula expressions for dynamic filtering and data retrieval workflows.', httpMethod: 'GET', httpUrl: '/{baseId}/{tableName}', parametersSchema: { type: 'object', properties: { baseId: { type: 'string' }, tableName: { type: 'string' }, filterByFormula: { type: 'string', description: 'Airtable formula, e.g. FIND("Acme",{Name}).' }, sort: { type: 'string', description: 'Sort expression in API format.' }, maxRecords: { type: 'integer' }, pageSize: { type: 'integer' } }, required: ['baseId', 'tableName', 'filterByFormula'] }, headersConfig: [], isEnabled: true }),
    ],
  },
  {
    id: 'google-sheets',
    name: 'Google Sheets via API',
    description: 'Lisez et ecrivez des cellules Google Sheets rapidement.',
    category: 'productivity',
    icon: 'Sheet',
    baseUrl: 'https://sheets.googleapis.com/v4/spreadsheets',
    authType: 'BEARER',
    authHelpUrl: 'https://developers.google.com/sheets/api/guides/authorizing',
    tools: [
      tool({ name: 'read_range', description: 'Read values from a specific A1 range in a spreadsheet for analytics, summaries, and QA tasks.', httpMethod: 'GET', httpUrl: '/{spreadsheetId}/values/{range}', parametersSchema: { type: 'object', properties: { spreadsheetId: { type: 'string' }, range: { type: 'string', description: 'A1 notation range, e.g. Sheet1!A1:D20.' }, majorDimension: { type: 'string', description: 'ROWS or COLUMNS.' }, valueRenderOption: { type: 'string', description: 'FORMATTED_VALUE, UNFORMATTED_VALUE, FORMULA.' } }, required: ['spreadsheetId', 'range'] }, headersConfig: [], isEnabled: true }),
      tool({ name: 'write_range', description: 'Write values into a target range, replacing existing content in a deterministic way.', httpMethod: 'PUT', httpUrl: '/{spreadsheetId}/values/{range}', parametersSchema: { type: 'object', properties: { spreadsheetId: { type: 'string' }, range: { type: 'string' }, valueInputOption: { type: 'string', description: 'RAW or USER_ENTERED.' }, majorDimension: { type: 'string' }, values: { type: 'array', description: '2D values matrix.' } }, required: ['spreadsheetId', 'range', 'valueInputOption', 'values'] }, headersConfig: [], isEnabled: true }),
      tool({ name: 'append_row', description: 'Append one or many rows after the last non-empty line in a sheet, useful for logs and event ingestion.', httpMethod: 'POST', httpUrl: '/{spreadsheetId}/values/{range}:append', parametersSchema: { type: 'object', properties: { spreadsheetId: { type: 'string' }, range: { type: 'string', description: 'Target table range like Sheet1!A:D.' }, valueInputOption: { type: 'string' }, insertDataOption: { type: 'string', description: 'INSERT_ROWS or OVERWRITE.' }, values: { type: 'array', description: 'Rows to append.' } }, required: ['spreadsheetId', 'range', 'valueInputOption', 'values'] }, headersConfig: [], isEnabled: true }),
      tool({ name: 'clear_range', description: 'Clear all values from a given range while preserving sheet structure and formatting.', httpMethod: 'POST', httpUrl: '/{spreadsheetId}/values/{range}:clear', parametersSchema: { type: 'object', properties: { spreadsheetId: { type: 'string' }, range: { type: 'string' } }, required: ['spreadsheetId', 'range'] }, headersConfig: [], isEnabled: true }),
    ],
  },
  {
    id: 'slack',
    name: 'Slack',
    description: 'Interagissez avec vos canaux et messages Slack.',
    category: 'communication',
    icon: 'MessageSquare',
    baseUrl: 'https://slack.com/api',
    authType: 'BEARER',
    authHelpUrl: 'https://api.slack.com/authentication/oauth-v2',
    tools: [
      tool({ name: 'send_message', description: 'Send a message to a Slack channel or DM. Supports plain text and rich block payloads.', httpMethod: 'POST', httpUrl: '/chat.postMessage', parametersSchema: { type: 'object', properties: { channel: { type: 'string', description: 'Channel ID or user ID.' }, text: { type: 'string', description: 'Message text fallback.' }, blocks: { type: 'array', description: 'Optional Slack blocks payload.' }, thread_ts: { type: 'string', description: 'Reply in thread timestamp.' } }, required: ['channel', 'text'] }, headersConfig: [], isEnabled: true }),
      tool({ name: 'list_channels', description: 'List public and private channels available to the token for routing and discovery workflows.', httpMethod: 'GET', httpUrl: '/conversations.list', parametersSchema: { type: 'object', properties: { limit: { type: 'integer' }, cursor: { type: 'string' }, types: { type: 'string', description: 'public_channel,private_channel,mpim,im.' }, exclude_archived: { type: 'boolean' } } }, headersConfig: [], isEnabled: true }),
      tool({ name: 'get_messages', description: 'Read recent messages from a channel to build context, summarize discussions, or monitor incidents.', httpMethod: 'GET', httpUrl: '/conversations.history', parametersSchema: { type: 'object', properties: { channel: { type: 'string', description: 'Channel ID.' }, limit: { type: 'integer' }, cursor: { type: 'string' }, oldest: { type: 'string', description: 'Unix timestamp lower bound.' }, latest: { type: 'string', description: 'Unix timestamp upper bound.' } }, required: ['channel'] }, headersConfig: [], isEnabled: true }),
    ],
  },
  {
    id: 'custom-rest-api',
    name: 'Custom REST API',
    description: 'Template generique pour brancher votre propre API REST.',
    category: 'developer',
    icon: 'Wrench',
    baseUrl: 'https://api.example.com',
    authType: 'NONE',
    tools: [
      tool({ name: 'get', description: 'Generic GET request. Configure endpoint path and query parameters for read-only access patterns.', httpMethod: 'GET', httpUrl: '/resource', parametersSchema: { type: 'object', properties: { resourcePath: { type: 'string', description: 'Adjust this URL/path to your real endpoint.' }, query: { type: 'object', description: 'Query params key/value object.' } } }, headersConfig: [], isEnabled: true }),
      tool({ name: 'post', description: 'Generic POST request. Use for object creation operations with a request body payload.', httpMethod: 'POST', httpUrl: '/resource', parametersSchema: { type: 'object', properties: { resourcePath: { type: 'string', description: 'Adjust this URL/path to your real endpoint.' }, body: { type: 'object', description: 'Payload to send in JSON body.' } } }, headersConfig: [], isEnabled: true }),
      tool({ name: 'put', description: 'Generic PUT request for complete updates or upsert-like API semantics.', httpMethod: 'PUT', httpUrl: '/resource/{id}', parametersSchema: { type: 'object', properties: { resourcePath: { type: 'string', description: 'Adjust this URL/path to your real endpoint.' }, id: { type: 'string', description: 'Resource identifier path param.' }, body: { type: 'object', description: 'Full replacement payload.' } } }, headersConfig: [], isEnabled: true }),
      tool({ name: 'delete', description: 'Generic DELETE request for resource removal endpoints.', httpMethod: 'DELETE', httpUrl: '/resource/{id}', parametersSchema: { type: 'object', properties: { resourcePath: { type: 'string', description: 'Adjust this URL/path to your real endpoint.' }, id: { type: 'string', description: 'Resource identifier path param.' } }, required: ['id'] }, headersConfig: [], isEnabled: true }),
    ],
  },
]

export function getServerTemplateById(templateId: string): ServerTemplate | undefined {
  return serverTemplates.find((template) => template.id === templateId)
}
