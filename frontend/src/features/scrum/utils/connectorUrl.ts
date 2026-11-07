/** The MCP connector's address (backend `app/mcp`): the API's, or this site's when the API is served from it. */
export function connectorUrl(apiBase: string, origin: string): string {
  return `${apiBase || origin}/mcp`;
}
