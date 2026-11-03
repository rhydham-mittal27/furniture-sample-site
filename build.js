// build.js - inlines theme-generator.js and site-content.json into the templates.
// index.template.html -> cozey.html (Cozey-style), home.template.html -> index.html (main, Sofaluxe-style)
const fs = require('fs');
const read = f => fs.readFileSync(__dirname + '/' + f, 'utf8');
const gen = read('theme-generator.js').replace(/if \(require\.main[\s\S]*$/, '');
const json = JSON.stringify(JSON.parse(read('site-content.json')));
for (const [src, out] of [['index.template.html', 'cozey.html'], ['home.template.html', 'index.html']]) {
  if (!fs.existsSync(__dirname + '/' + src)) continue;
  const html = read(src).replace('/*GENERATOR*/', () => gen).replace('/*JSON*/', () => json);
  fs.writeFileSync(__dirname + '/' + out, html);
  console.log('built', out, html.length, 'bytes');
}
