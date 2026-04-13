import fs from "fs";
const p = new URL("../lib/storyReveal.ts", import.meta.url);
let s = fs.readFileSync(p, "utf8");
s = s.replace(/של ח\uFFFD\uFFFD,/g, "של חיי\u05da,");
s = s.replace(/, והיא\uFFFDרת /g, ", והיא \u05d6\u05d5\u05d4\u05e8\u05ea ");
s = s.replace(/זו\uFFFDרת/g, "\u05d6\u05d5\u05d4\u05e8\u05ea");
fs.writeFileSync(p, s);
console.log("ok");
