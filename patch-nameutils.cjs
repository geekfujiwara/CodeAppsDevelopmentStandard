const fs = require('fs');
const p = 'node_modules/@microsoft/power-apps-actions/dist/CodeGen/shared/nameUtils.js';
let c = fs.readFileSync(p, 'utf8');
const oldPat = "[^a-zA-Z0-9_$]/g, '_')";
const newPat = "[^a-zA-Z0-9_$\\u00C0-\\u024F\\u0370-\\u03FF\\u0400-\\u04FF\\u3000-\\u9FFF\\uAC00-\\uD7AF\\uF900-\\uFAFF]/g, '_')";
if (c.includes(oldPat)) {
  c = c.replace(oldPat, newPat);
  fs.writeFileSync(p, c);
  console.log('Patched successfully');
} else {
  console.log('Already patched or pattern not found');
}
