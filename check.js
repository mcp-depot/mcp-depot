const t = require('./tools.json').tools;
t.forEach((x, i) => {
  const s = x.input_schema?.properties;
  if (s) {
    Object.entries(s).forEach(([k, v]) => {
      if (!v.type) {
        console.log('MISSING TYPE:', i, x.name, k, JSON.stringify(v));
      }
    });
  }
});
