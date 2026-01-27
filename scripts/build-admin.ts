/**
 * Build script for admin UI assets.
 * Pre-bundles React app and CSS for embedding in the compiled binary.
 */

import { resolve } from "path";
import { mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import tailwindPlugin from "bun-plugin-tailwind";

const projectRoot = resolve(import.meta.dir, "..");
const adminDir = resolve(projectRoot, "src/admin");
const outDir = resolve(projectRoot, "dist/admin");

// Ensure output directory exists
await mkdir(outDir, { recursive: true });

// Helper to resolve file with extensions
function resolveWithExtensions(basePath: string): string | null {
  const extensions = [".tsx", ".ts", ".jsx", ".js"];
  // First check if the path already has an extension
  if (existsSync(basePath)) return basePath;
  // Try each extension
  for (const ext of extensions) {
    const fullPath = basePath + ext;
    if (existsSync(fullPath)) return fullPath;
  }
  // Try index files
  for (const ext of extensions) {
    const indexPath = resolve(basePath, `index${ext}`);
    if (existsSync(indexPath)) return indexPath;
  }
  return null;
}

// Bundle the React app
const jsResult = await Bun.build({
  entrypoints: [resolve(adminDir, "main.tsx")],
  outdir: outDir,
  target: "browser",
  format: "esm",
  minify: true,
  sourcemap: "none",
  define: {
    "process.env.NODE_ENV": '"production"',
  },
  // Resolve path aliases and extensions
  plugins: [
    {
      name: "alias-and-extension-resolver",
      setup(build) {
        // Handle @/ path alias
        build.onResolve({ filter: /^@\// }, (args) => {
          const relativePath = args.path.replace(/^@\//, "");
          const basePath = resolve(adminDir, relativePath);
          const resolved = resolveWithExtensions(basePath);
          if (resolved) {
            return { path: resolved };
          }
          return { path: basePath };
        });
      },
    },
  ],
});

if (!jsResult.success) {
  console.error("JS build failed:");
  for (const log of jsResult.logs) {
    console.error(log);
  }
  process.exit(1);
}

// Bundle CSS with Tailwind
const cssResult = await Bun.build({
  entrypoints: [resolve(adminDir, "styles/globals.css")],
  outdir: outDir,
  minify: true,
  plugins: [tailwindPlugin],
});

if (!cssResult.success) {
  console.error("CSS build failed:");
  for (const log of cssResult.logs) {
    console.error(log);
  }
  process.exit(1);
}

// Generate HTML with correct asset paths
const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>BunBase Admin</title>
  <link rel="stylesheet" href="/_/assets/globals.css">
</head>
<body class="min-h-screen bg-background font-sans antialiased">
  <div id="root"></div>
  <script type="module" src="/_/assets/main.js"></script>
</body>
</html>`;

await Bun.write(resolve(outDir, "index.html"), html);

console.log("Admin UI built successfully:");
console.log(`  - ${outDir}/index.html`);
console.log(`  - ${outDir}/main.js`);
console.log(`  - ${outDir}/globals.css`);
