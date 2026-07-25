-- ═══════════════════════════════════════════════════════════════════════════
-- PROD STAGING — Wayfinder review-notes import          ⚠ NOT YET APPLIED
-- Target: GrepThink2-PROD (yfezwtoeoexfksvbpxmi)
-- Prereq: 2026-07-24_final_review_scoring.sql (the final_review_notes table).
-- ═══════════════════════════════════════════════════════════════════════════
-- One-time import of the Wayfinder entries Pranay already wrote in the
-- "Project Review Notes" Google Doc, mapped onto template v1 keys. Text is
-- verbatim from the doc. ON CONFLICT DO NOTHING: if notes already exist in
-- the app (e.g. edited via the UI), this import NEVER overwrites them.
-- Scores are deliberately NOT seeded (the doc and the score sheet disagree
-- for Wayfinder — TAs enter scores through the UI).
--
-- Wayfinder project: 5f7760a0-851e-4321-bfce-2714dc23442a
-- Author (Review TA Pranay): adfa5354-8933-4f30-a4b8-73718f553f5c

INSERT INTO public.final_review_notes (class_id, project_id, content, template_version, updated_by)
VALUES (
  'ca9b1627-bb0c-4a88-8e61-32341863033f',
  '5f7760a0-851e-4321-bfce-2714dc23442a',
  $${
    "project_scope": "Travel app with hotels, flights, itineraries to streamline vacations for users. Hotels is just behind Lite API with aggregated ratings originating from <unknown> source. Flight data is also hardcoded and the search is just a form input. The itinerary planner is the most solid feature as it contains geo tagged places as input, activity planning and CRUD as well as advisory alerts for the place like weather and natural events.",
    "demo": "React native app - functional in terms of peeking at hotel options (with reviews aggregated) but severely lacking in terms of real world or daily usage as most of it is just mocked up data with no concrete deeplinks.",
    "code_review": "Codebase is completely spread out; intractable for LLM agents to work with since there's no AGENTS.md! Lots of low quality components, empty placeholder vars for API keys and lack of consistent styling/theming choices.",
    "testing": "Some unit testing, Jun was working on CI/CD which is much appreciated.",
    "process_overview": "Weak documents - no burnup charts; no consistent sprint reports; tasks added have a lot of breadth but no depth hence the weak product",
    "style_guides": "Missing",
    "dod": "Missing",
    "release_plan": "Very average, not iteratively refined..",
    "sprint_plan": "Plans look good",
    "sprint_report": "Reports lack actions…, burnup charts",
    "test_plan_report": "NaN",
    "release_summary": "NaN",
    "discussion": "Very vague and shaky understanding of the codebase so far however the end product looks presentable albeit of limited use",
    "ai_tools": "Great usage, not so much for rigor - lacks AGENTS.md",
    "comments": "Team moved extremely quickly with AI with no attention to detail or quality control. A prime example of vibe coding scaled to a few people. What scares me the most is the lack of effort spent to understand what was produced. A general lack of gratitude for these tools that are pushing humanity forward as we speak.",
    "member_contributions": {
      "e7ed452f-82c9-446e-a608-684a60a60545": "UI/UX design + frontend dev",
      "7a836e9d-33bc-40da-a902-0c54efe18140": "Sprint plans, docs; design styling",
      "7cc38a38-4e93-46f5-9408-c4994682be5e": "Backend - maps, weather, city search",
      "d77700b2-23c7-4bf4-8302-942ebac23f85": "Frontend - collab with ally - design + RN maps + web split",
      "6c079634-d289-4a08-b18c-da6a325ac79f": "Backend - hotels, product backlog (and direction); supabase + render; AI chatbot; CI/CD"
    }
  }$$::jsonb,
  1,
  'adfa5354-8933-4f30-a4b8-73718f553f5c'
)
ON CONFLICT ON CONSTRAINT final_review_notes_project_unique DO NOTHING;
