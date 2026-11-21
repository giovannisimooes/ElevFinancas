// Gera um único index.html (CSS + JS embutidos) a partir de src/.
// Uso: npm install && npm run build
import { build } from "esbuild";
import { readFileSync, writeFileSync } from "node:fs";

const res = await build({
  entryPoints: ["src/main.tsx"], bundle: true, minify: true, write: false, format: "iife", target: "es2020",
  jsx: "automatic", define: { "process.env.NODE_ENV": '"production"' }, legalComments: "none", logLevel: "warning",
});
const js = res.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");
const css = readFileSync("src/styles.css", "utf8");
const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>ELEV FINANCE</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap">
<style>${css}</style>
</head>
<body>
<div id="root"></div>
<script>${js}</script>
</body>
</html>`;
writeFileSync("index.html", html);
console.log("index.html", (html.length / 1024).toFixed(0) + " KB");
