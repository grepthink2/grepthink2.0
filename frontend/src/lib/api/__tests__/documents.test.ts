import { beforeEach, describe, expect, it, vi } from 'vitest';

const getSession = vi.hoisted(() => vi.fn());
vi.mock('@/lib/supabaseClient', () => ({ supabase: { auth: { getSession } } }));

import { documentsApi } from '../documents';
import type { ApiDocumentKind, ApiReleaseSummaryBody } from '../types';

const fetchMock = vi.fn();

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** The request the method made: its URL, method (fetch's default is GET) and parsed body. */
function sent() {
  const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  return {
    url,
    method: init.method ?? 'GET',
    body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined,
  };
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  getSession.mockResolvedValue({ data: { session: { access_token: 'tok' } } });
});

const DOCUMENT = { document: { id: 'd1', kind: 'release_summary' }, revision: { number: 2 } };

describe('getProjectDocuments', () => {
  it("GETs the team's documents tab", async () => {
    const slots = { documents: [{ kind: 'release_summary', title: 'Release summary', sprint: null, document: null }] };
    fetchMock.mockResolvedValue(jsonResponse(200, slots));

    await expect(documentsApi.getProjectDocuments('p1')).resolves.toEqual(slots);
    expect(sent()).toEqual({ url: '/api/projects/p1/documents', method: 'GET', body: undefined });
  });
});

describe('getDocumentStories', () => {
  it("GETs the board's live stories for the documents' pickers", async () => {
    const stories = { stories: [{ id: 's1', key: 'US-1', sprint_id: null }] };
    fetchMock.mockResolvedValue(jsonResponse(200, stories));

    await expect(documentsApi.getDocumentStories('p1')).resolves.toEqual(stories);
    expect(sent()).toEqual({ url: '/api/projects/p1/documents/stories', method: 'GET', body: undefined });
  });
});

describe('createDocument', () => {
  it.each<[string, ApiDocumentKind, string | undefined, object]>([
    ['a sprint report, with its sprint', 'sprint_report', 's1', { kind: 'sprint_report', sprint_id: 's1' }],
    ["a project's document, with no sprint", 'release_summary', undefined, { kind: 'release_summary' }],
  ])('POSTs %s', async (_case, kind, sprintId, body) => {
    fetchMock.mockResolvedValue(jsonResponse(201, DOCUMENT));

    await expect(documentsApi.createDocument('p1', kind, sprintId)).resolves.toEqual(DOCUMENT);
    expect(sent()).toEqual({ url: '/api/projects/p1/documents', method: 'POST', body });
  });
});

describe('getDocument', () => {
  it.each<[string, number | undefined, string]>([
    ['the revision its reader opens on', undefined, '/api/documents/d1'],
    ['a revision', 3, '/api/documents/d1?revision=3'],
  ])('GETs %s', async (_case, revision, url) => {
    fetchMock.mockResolvedValue(jsonResponse(200, DOCUMENT));

    await expect(documentsApi.getDocument('d1', revision)).resolves.toEqual(DOCUMENT);
    expect(sent()).toEqual({ url, method: 'GET', body: undefined });
  });
});

describe('saveDocument', () => {
  it('PUTs the whole body and the revision the edit started from', async () => {
    const body: ApiReleaseSummaryBody = { key_story_ids: ['st1'], known_problems: [], follow_ups: [] };
    const saved = { revision: 3, overwrote: { number: 2, by: 'u2', by_name: 'Sam' } };
    fetchMock.mockResolvedValue(jsonResponse(200, saved));

    await expect(documentsApi.saveDocument('d1', body, 1)).resolves.toEqual(saved);
    expect(sent()).toEqual({ url: '/api/documents/d1', method: 'PUT', body: { body, base_revision: 1 } });
  });
});

describe('getDocumentRevisions', () => {
  it("GETs the document's revisions", async () => {
    const revisions = { revisions: [{ number: 2, finalized: true }] };
    fetchMock.mockResolvedValue(jsonResponse(200, revisions));

    await expect(documentsApi.getDocumentRevisions('d1')).resolves.toEqual(revisions);
    expect(sent()).toEqual({ url: '/api/documents/d1/revisions', method: 'GET', body: undefined });
  });
});

describe('finalizeDocument', () => {
  it('POSTs the revision the caller is looking at', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, DOCUMENT));

    await expect(documentsApi.finalizeDocument('d1', 2)).resolves.toEqual(DOCUMENT);
    expect(sent()).toEqual({ url: '/api/documents/d1/finalize', method: 'POST', body: { revision: 2 } });
  });
});

describe('deleteDocument', () => {
  it('DELETEs the document', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    await expect(documentsApi.deleteDocument('d1')).resolves.toBeUndefined();
    expect(sent()).toEqual({ url: '/api/documents/d1', method: 'DELETE', body: undefined });
  });
});

describe('getDocumentMarkdown', () => {
  it('GETs the Markdown and answers its text', async () => {
    const text = '# Release Summary\n\n- **Product:** Trailhead\n';
    fetchMock.mockResolvedValue(
      new Response(text, { status: 200, headers: { 'Content-Type': 'text/markdown; charset=utf-8' } }),
    );

    await expect(documentsApi.getDocumentMarkdown('d1')).resolves.toBe(text);
    expect(sent()).toEqual({ url: '/api/documents/d1/markdown', method: 'GET', body: undefined });
  });
});

describe('getDocumentMarkdownFile', () => {
  it('GETs the Markdown with the file name the API gives it', async () => {
    const text = '# Sprint Report\n';
    fetchMock.mockResolvedValue(new Response(text, {
      status: 200,
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Content-Disposition': 'attachment; filename="trailhead-sprint-2-report.md"',
      },
    }));

    await expect(documentsApi.getDocumentMarkdownFile('d1')).resolves.toEqual({
      text, filename: 'trailhead-sprint-2-report.md',
    });
    expect(sent()).toEqual({ url: '/api/documents/d1/markdown', method: 'GET', body: undefined });
  });

  it('answers no file name when the response gives none', async () => {
    fetchMock.mockResolvedValue(new Response('# x', { status: 200 }));
    await expect(documentsApi.getDocumentMarkdownFile('d1')).resolves.toEqual({ text: '# x', filename: null });
  });
});

describe('getClassDocuments', () => {
  it("GETs every document of the class's teams", async () => {
    const rows = { documents: [{ id: 'd1', project_name: 'Trailhead' }] };
    fetchMock.mockResolvedValue(jsonResponse(200, rows));

    await expect(documentsApi.getClassDocuments('c1')).resolves.toEqual(rows);
    expect(sent()).toEqual({ url: '/api/classes/c1/documents', method: 'GET', body: undefined });
  });
});
