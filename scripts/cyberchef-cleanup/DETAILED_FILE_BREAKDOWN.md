# Detailed File Breakdown - CyberChef-MCP Cleanup

## Complete List of Files to Delete (88 files)

### src/web/ Directory (81 files)

#### Core Web App Files (6 files)
```
./src/web/App.mjs
./src/web/HTMLCategory.mjs
./src/web/HTMLIngredient.mjs
./src/web/HTMLOperation.mjs
./src/web/Manager.mjs
./src/web/html/index.html
```

#### Static Assets - Fonts (14 files)
```
./src/web/static/fonts/bmfonts/Roboto72White.fnt
./src/web/static/fonts/bmfonts/Roboto72White.png
./src/web/static/fonts/bmfonts/RobotoBlack72White.fnt
./src/web/static/fonts/bmfonts/RobotoBlack72White.png
./src/web/static/fonts/bmfonts/RobotoMono72White.fnt
./src/web/static/fonts/bmfonts/RobotoMono72White.png
./src/web/static/fonts/bmfonts/RobotoSlab72White.fnt
./src/web/static/fonts/bmfonts/RobotoSlab72White.png
./src/web/static/fonts/MaterialIcons-Regular.ttf
./src/web/static/fonts/Roboto-Bold.woff2
./src/web/static/fonts/Roboto-Regular.woff2
./src/web/static/fonts/RobotoMono-Regular.woff2
./src/web/static/fonts/RobotoSlab-Regular.woff2
./src/web/static/fonts/selawk.ttf
```

#### Static Assets - Images (21 files)
```
./src/web/static/images/bombe.svg
./src/web/static/images/cook_female-32x32.png
./src/web/static/images/cook_male-32x32.png
./src/web/static/images/cyberchef-128x128.png
./src/web/static/images/cyberchef-16x16.png
./src/web/static/images/cyberchef-192x192.png
./src/web/static/images/cyberchef-256x256.png
./src/web/static/images/cyberchef-32x32.png
./src/web/static/images/cyberchef-512x512.png
./src/web/static/images/cyberchef-64x64.png
./src/web/static/images/dotted-hex.png
./src/web/static/images/favicon.ico
./src/web/static/images/logo/cyberchef_logo.svg
./src/web/static/images/logo/cyberchef_main_white-transp.png
./src/web/static/images/logo/cyberchef_main.png
./src/web/static/images/logo/cyberchef_round-edged_no-text.png
./src/web/static/images/logo/cyberchef_round-edged.png
./src/web/static/images/logo/cyberchef_round.png
./src/web/static/images/logo/cyberchef_square-edged.png
./src/web/static/images/screenshot_main.png
./src/web/static/images/screenshot_small.png
```

#### Static Web Files (4 files)
```
./src/web/static/ga.html
./src/web/static/manifest.json
./src/web/static/robots.txt
./src/web/static/sitemap.mjs
```

#### Stylesheets (11 files)
```
./src/web/stylesheets/components/_categories.css
./src/web/stylesheets/components/_global.css
./src/web/stylesheets/components/_layout.css
./src/web/stylesheets/components/_operations.css
./src/web/stylesheets/components/_recipe.css
./src/web/stylesheets/components/_splash.css
./src/web/stylesheets/index.js
./src/web/stylesheets/structure/_codemirror.css
./src/web/stylesheets/structure/_global.css
./src/web/stylesheets/structure/_layout.css
./src/web/stylesheets/themes/_classic.css
```

#### UI Waiters (13 files)
```
./src/web/waiters/BindingsWaiter.mjs
./src/web/waiters/ControlsWaiter.mjs
./src/web/waiters/HighlighterWaiter.mjs
./src/web/waiters/HistoryWaiter.mjs
./src/web/waiters/InputWaiter.mjs
./src/web/waiters/OperationsWaiter.mjs
./src/web/waiters/OptionsWaiter.mjs
./src/web/waiters/OutputWaiter.mjs
./src/web/waiters/RecipeWaiter.mjs
./src/web/waiters/SeasonalWaiter.mjs
./src/web/waiters/StatusBarWaiter.mjs
./src/web/waiters/WindowWaiter.mjs
./src/web/waiters/WorkerWaiter.mjs
```

#### Web Workers (12 files)
```
./src/web/workers/ChefWorker.mjs
./src/web/workers/DishWorker.mjs
./src/web/workers/handleChefMessage.mjs
./src/web/workers/InputWorker.mjs
./src/web/workers/LoaderWorker.js
./src/web/workers/newWorker.mjs
./src/web/workers/OpModules.mjs
./src/web/workers/OperationsWaiter.worker.mjs
./src/web/workers/waiterMessage.mjs
./src/web/workers/WorkerWaiter.worker.mjs
./src/web/workers/ZipWorker.mjs
./src/web/workers/ZipWorker.worker.mjs
```

### Browser Tests (4 files)
```
./tests/browser/01-io.js
./tests/browser/02-ops.js
./tests/browser/03-highlighter.js
./tests/browser/04-operations.js
```

### Configuration Files (2 files)
```
./nightwatch.json
./postcss.config.js
```

### DevContainer (1 file)
```
./.devcontainer/devcontainer.json
```

---

## Files to Modify (5 files)

### GitHub Issue Templates (5 files)
```
./.github/CONTRIBUTING.md
./.github/ISSUE_TEMPLATE.md
./.github/ISSUE_TEMPLATE/bug-report.md
./.github/ISSUE_TEMPLATE/feature-request.md
./.github/ISSUE_TEMPLATE/operation-request.md
```

**Modifications Required:**
1. Replace `GCHQ/CyberChef` → `doublegate/CyberChef-MCP`
2. Update URLs to point to MCP repository
3. Add MCP-specific context to templates
4. Update CONTRIBUTING.md with MCP development workflow

---

## Files to Keep Unchanged (746 files)

### By Category:

| Category | Count | Examples |
|----------|-------|----------|
| Core Operations | 547 | `src/core/operations/*.mjs` |
| Operation Tests | 160 | `tests/operations/tests/*.mjs` |
| Node Tests | 10 | `tests/node/tests/*.mjs` |
| Test Samples | 7 | `tests/samples/files/*.{jpeg,mp3,png}` |
| Test Libraries | 2 | `tests/lib/*.mjs` |
| Config Files | 7 | `.cspell.json`, `.editorconfig`, `LICENSE` |
| Node API | 8 | `src/node/*.mjs` (identical ones) |
| Other | 5 | Various config/build files |

### Critical Files to Keep:

**Essential Config:**
- `.cspell.json` - Used by `npm run lint:grammar`
- `.editorconfig` - Editor configuration
- `.npmignore` - NPM package exclusions
- `eslint.config.mjs` - Used by `npm run lint`
- `.gitattributes` - Git file handling
- `LICENSE` - Apache 2.0 license
- `CODE_OF_CONDUCT.md` - Community guidelines

**Build/Test:**
- All `src/core/` files - Core operations
- All `tests/operations/` files - Operation validation
- All `tests/node/` files - Node API validation
- `tests/samples/` - Test data
- `tests/lib/` - Test utilities

---

## Size Impact Analysis

### Current Repository Structure:
```
Total files: 1,024
├── Identical to upstream: 834
├── Modified from upstream: 41
└── New to CyberChef-MCP: 149
```

### After Cleanup:
```
Total files: 936 (-88)
├── Kept identical: 746
├── Modified from upstream: 41 (+5 templates)
└── New to CyberChef-MCP: 149
```

### Disk Space:
- **Images:** ~1.5 MB (21 files)
- **Fonts:** ~1.0 MB (14 files)
- **Code:** ~0.5 MB (53 files)
- **Total savings:** ~3 MB

### Benefits:
1. Clearer project focus (MCP server vs web UI)
2. Faster `git clone` operations
3. Reduced confusion for contributors
4. Easier maintenance (fewer files to track)
5. Better separation from upstream web UI

---

## Dependencies Verified Safe to Remove

### Package.json Dependencies Used ONLY by Web UI:
```json
{
  "bootstrap": "4.6.2",              // Web UI framework
  "bootstrap-colorpicker": "^3.4.0", // Web color picker
  "bootstrap-material-design": "^4.1.3", // Web UI theme
  "d3": "7.9.0",                     // Web visualizations
  "d3-hexbin": "^0.2.2",            // Web hex grid
  "dompurify": "^3.2.5",            // Web XSS protection
  "file-saver": "^2.0.5",           // Web file download
  "highlight.js": "^11.9.0",        // Web syntax highlighting
  "jquery": "3.7.1",                // Web UI library
  "popper.js": "^1.16.1",           // Web tooltip positioning
  "snackbarjs": "^1.1.0",           // Web notifications
  "sortablejs": "^1.15.2",          // Web drag-drop
  "split.js": "^1.6.5"              // Web panel resizing
}
```

**Note:** These dependencies remain in package.json but won't be used by MCP code. They could be removed in a future cleanup if the web build task is fully deprecated.

### Package.json DevDependencies Used ONLY by Web UI:
```json
{
  "nightwatch": "^3.6.3",           // Browser UI testing
  "chromedriver": "^130.0.0",       // Browser automation
  "postcss": "^8.4.38",             // CSS processing
  "postcss-*": "...",               // PostCSS plugins
  "css-loader": "7.1.2",            // Webpack CSS loader
  "mini-css-extract-plugin": "2.9.0", // CSS extraction
  "html-webpack-plugin": "^5.6.0"   // HTML generation
}
```

**Note:** These can remain for now as they don't affect MCP functionality.

