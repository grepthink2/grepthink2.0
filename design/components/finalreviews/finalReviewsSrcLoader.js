/* Dev fallback: when the compiled _ds_bundle.js predates components/finalreviews/ (it regenerates once
   per turn), transpile the family straight from source into the same namespace. Loads the schedule and
   team-meetings families first, and Badge when the bundle's status map predates the C2 keys.
   Inert as soon as the bundle carries SlotBoard and the slot.* status keys. */
window.loadFinalReviewSources = async function loadFinalReviewSources(base) {
  if (window.loadTeamMeetingSources) await window.loadTeamMeetingSources(base);
  else if (window.loadScheduleSources) await window.loadScheduleSources(base);
  const NS = window.GrepThinkDesignSystem_36e7e3 || (window.GrepThinkDesignSystem_36e7e3 = {});
  const run = async (path) => {
    let src = await (await fetch(`${base}/${path}`)).text();
    const needed = [], found = [];
    src = src.replace(/import\s*\{([^}]*)\}\s*from\s*'[^']+';?/g, (m, names) => { needed.push(...names.split(',').map((s) => s.trim()).filter(Boolean)); return ''; });
    src = src.replace(/^import React[^\n]*$/mg, '');
    src = src.replace(/^export\s+(function|const)\s+([A-Za-z_$][\w$]*)/mg, (m, kind, id) => { found.push(id); return `${kind} ${id}`; });
    const prelude = needed.length ? `const {${[...new Set(needed)].join(',')}} = __NS;\n` : '';
    const code = Babel.transform(prelude + src + `\n;Object.assign(__NS, {${found.join(',')}});`, { presets: ['react'] }).code;
    new Function('React', '__NS', code)(window.React, NS);
  };
  if (!NS.BADGE_STATUS || !NS.BADGE_STATUS['slot.free']) await run('components/display/Badge.jsx');
  if (NS.SlotBoard && NS.FinalReviewsModel && NS.PostSlotsDrawer && NS.ReviewWorkspaceHeader) return NS;
  const order = ['FinalReviewsModel', 'FinalReviewsIcon', 'SlotTime', 'SlotRow', 'SlotBoard', 'FinalReviewsHeader', 'TeamReview', 'UnbookedTeams', 'SlotActionDialog', 'PostSlotsDrawer', 'ReviewWorkspaceHeader'];
  for (const name of order) await run(`components/finalreviews/${name}.jsx`);
  return NS;
};

window.runDeferredBabel = window.runDeferredBabel || function runDeferredBabel() {
  document.querySelectorAll('script[type="text/babel-deferred"]').forEach((s) => {
    new Function(Babel.transform(s.textContent, { presets: ['react'] }).code)();
  });
};
