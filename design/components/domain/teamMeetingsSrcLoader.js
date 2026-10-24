/* Dev fallback: when the compiled _ds_bundle.js predates the team-meetings components (it regenerates
   once per turn), transpile them straight from source into the same namespace. Needs the schedule
   family first (loadScheduleSources). Inert as soon as the bundle carries TeamMeetingsList. */
window.loadTeamMeetingSources = async function loadTeamMeetingSources(base) {
  if (window.loadScheduleSources) await window.loadScheduleSources(base);
  const NS = window.GrepThinkDesignSystem_36e7e3 || (window.GrepThinkDesignSystem_36e7e3 = {});
  if (NS.TeamMeetingsList && NS.TeamMeetingForm && NS.TeamMeetingsModel) return NS;
  const order = ['TeamMeetingsModel', 'TeamMeetingForm', 'TeamMeetingsList'];
  for (const name of order) {
    let src = await (await fetch(`${base}/components/domain/${name}.jsx`)).text();
    const needed = [], found = [];
    src = src.replace(/import\s*\{([^}]*)\}\s*from\s*'[^']+';?/g, (m, names) => { needed.push(...names.split(',').map((s) => s.trim()).filter(Boolean)); return ''; });
    src = src.replace(/^import React[^\n]*$/mg, '');
    src = src.replace(/^export\s+(function|const)\s+([A-Za-z_$][\w$]*)/mg, (m, kind, id) => { found.push(id); return `${kind} ${id}`; });
    const prelude = needed.length ? `const {${[...new Set(needed)].join(',')}} = __NS;\n` : '';
    const code = Babel.transform(prelude + src + `\n;Object.assign(__NS, {${found.join(',')}});`, { presets: ['react'] }).code;
    new Function('React', '__NS', code)(window.React, NS);
  }
  return NS;
};

window.runDeferredBabel = window.runDeferredBabel || function runDeferredBabel() {
  document.querySelectorAll('script[type="text/babel-deferred"]').forEach((s) => {
    new Function(Babel.transform(s.textContent, { presets: ['react'] }).code)();
  });
};
