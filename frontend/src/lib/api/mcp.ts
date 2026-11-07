/** The scrum board MCP connector's sign-in (consent page) and Settings → Connected apps. */
import { apiRequest } from './client';
import type { ApiMcpAuthorization, ApiMcpConnection } from './types';

export const mcpApi = {

  // ----- Consent page ------------------------------------------------------

  getMcpAuthorization: async (requestId: string) => {
    return apiRequest<ApiMcpAuthorization>(`/api/mcp/authorizations/${encodeURIComponent(requestId)}`);
  },

  /** Answers with where the browser goes next: the app, with a code or with access_denied. */
  answerMcpAuthorization: async (requestId: string, approve: boolean) => {
    return apiRequest<{ redirect_url: string }>(`/api/mcp/authorizations/${encodeURIComponent(requestId)}`, {
      method: 'POST',
      body: JSON.stringify({ approve }),
    });
  },

  // ----- Connected apps ----------------------------------------------------

  getMcpConnections: async () => {
    return apiRequest<{ connections: ApiMcpConnection[] }>('/api/mcp/connections');
  },

  disconnectMcpConnection: async (clientId: string) => {
    return apiRequest<void>(`/api/mcp/connections/${encodeURIComponent(clientId)}`, { method: 'DELETE' });
  },
};
