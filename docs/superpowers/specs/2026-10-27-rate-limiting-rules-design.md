# Rate limiting as a rules engine: proposal (later, not started)

Date: 2026-10-27. Status: a task for later, asked for by the maintainer. Not agreed in detail yet: brainstorm
it before building.

## Why

Rate limits today are slowapi decorators, one per route (`@limiter.limit(...)` plus a `request: Request`
parameter), each keyed and tuned on its own. Some are keyed by address, and on Vercel every request arrives
from the proxy's address, so one bucket covers everybody (the search index works around it with a per-user
key). Several public or abuse-prone endpoints have no limit at all. These include `/mcp` and the MCP
authorization endpoints (`/register`, `/authorize`, `/token`, `/revoke`), left out on the maintainer's
decision until this exists.

## The idea

A generic module in the spirit of [nogo](https://github.com/pronei/nogo), a lightweight rules-driven rate
limiter:

- **Rules, not decorators.** A rule names an entity (the signed-in user, the client IP from a trusted proxy
  header, an MCP client id, a project) and its limits, optionally narrowed by attributes (the route, the
  user's account role). Every limit a request matches must pass.
- **Plug and play per endpoint.** An endpoint opts in by name (one dependency, or one entry in a rules file),
  and its numbers live in the rules. Changing a limit needs no code change.
- **Strategies:** sliding window and token bucket, at least.
- **A pluggable store.** On Vercel, in-process memory is per instance, so a shared store is needed for real
  limits: Postgres (a small counters table or an RPC) or a hosted Redis/KV.
- **Clear answers.** A refusal is 429 with `Retry-After` and the house error shape (`detail`, `code`).

## Questions to settle when it starts

- Where the rules live (a file in the repo, a table) and who may change them.
- The store, and its cost and latency per request on Vercel.
- How to move the existing slowapi limits over (all at once, or route by route).
- The first limits for `/mcp` and the MCP authorization endpoints.
