// How many people visited the live site. Reads Vercel Web Analytics for the friendgame project through the Vercel CLI
// (you must be logged in to the vishweshck3-7605 account). Usage: node tools/visits.js [days=30]
const { execSync } = require('child_process');
const days = Number(process.argv[2] || 30), PROJECT = 'prj_6db0ld1K5jCaXtWHZAoZ2Q6IdFnR', TEAM = 'team_nBnfxVEKbR8uPPAlS9tGy3DG';
const to = new Date(), from = new Date(Date.now() - days * 864e5);
const q = (path) => { const out = execSync(`npx -y vercel@latest api "${path}" 2>/dev/null`, { cwd: __dirname + '/..' }).toString(); return JSON.parse(out.slice(out.indexOf('{'))); };
const range = `projectId=${PROJECT}&teamId=${TEAM}&from=${from.toISOString()}&to=${to.toISOString()}`;
try {
  const v = q(`/v1/query/web-analytics/visits/count?${range}`).data || {};
  console.log(`Last ${days} days on friendgame.vercel.app:  ${v.visitors ?? 0} visitors,  ${v.pageviews ?? 0} page views`);
  console.log('(Vercel groups by day and counts each visitor once per day. Daily breakdown: https://vercel.com/dashboard -> friendgame -> Analytics)');
} catch (e) { console.log('Could not read analytics:', e.message.split('\n')[0]); console.log('Open https://vercel.com/dashboard -> friendgame -> Analytics to see them in the browser.'); }
