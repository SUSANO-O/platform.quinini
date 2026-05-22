import fs from 'fs';
import path from 'path';

const root = path.resolve('src');
const replacements = [
  ["'linear-gradient(135deg, var(--gradient-start), var(--gradient-mid))'", "'var(--brand-primary)'"],
  ['`linear-gradient(135deg, ${R}, ${O})`', 'R'],
  ['`linear-gradient(135deg,${R},${O})`', 'R'],
  ['`linear-gradient(135deg, ${BRAND_R}, ${BRAND_O})`', 'BRAND_R'],
  ['`linear-gradient(135deg, ${BRAND.primary}, ${BRAND.warm})`', 'BRAND.primary'],
  ['`linear-gradient(135deg, ${R}, var(--brand-warm))`', 'R'],
  ["'linear-gradient(135deg, var(--brand-cool), #0284c7)'", "'var(--brand-cool)'"],
  ["'linear-gradient(135deg, #0d9488, #6366f1)'", "'var(--brand-primary)'"],
  ["'linear-gradient(135deg, #0d9488, #1e40af)'", "'var(--brand-primary)'"],
  ["`linear-gradient(135deg, ${Rd}, ${O})`", 'Rd'],
  ["`linear-gradient(135deg, ${O}, ${Y})`", 'O'],
  ["`linear-gradient(135deg, ${D}, ${R})`", 'D'],
  ["`linear-gradient(135deg, ${G}, ${C})`", 'G'],
  ["'linear-gradient(135deg, rgba(var(--brand-primary-rgb),0.12), rgba(var(--brand-warm-rgb),0.12))'", "'rgba(var(--brand-primary-rgb),0.1)'"],
  ["'linear-gradient(135deg, rgba(var(--brand-primary-rgb),0.04), rgba(var(--brand-warm-rgb),0.04))'", "'rgba(var(--brand-primary-rgb),0.04)'"],
  ["'linear-gradient(135deg, rgba(var(--brand-primary-rgb),0.08), rgba(var(--brand-warm-rgb),0.08))'", "'rgba(var(--brand-primary-rgb),0.08)'"],
  ["`linear-gradient(135deg,${accent},${accent}bb)`", 'accent'],
  ['? `linear-gradient(135deg, ${R}, ${O})` : plan.color', '? R : plan.color'],
  ['background: `linear-gradient(135deg, ${R}, ${O})`,', 'background: R,'],
  ['background: `linear-gradient(135deg, ${accentColor}, ${accentColor}99)`', 'background: accentColor'],
];

function walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    const file = path.join(dir, name);
    if (fs.statSync(file).isDirectory()) walk(file);
    else if (/\.(tsx|ts)$/.test(name)) {
      let content = fs.readFileSync(file, 'utf8');
      let next = content;
      for (const [from, to] of replacements) next = next.split(from).join(to);
      if (next !== content) {
        fs.writeFileSync(file, next);
        console.log('updated', path.relative(root, file));
      }
    }
  }
}

walk(root);
