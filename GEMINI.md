# CyberChef Context

## Project Overview
CyberChef is a simple, intuitive web app for carrying out all manner of "cyber" operations within a web browser. It is designed to enable both technical and non-technical analysts to manipulate data in complex ways (encryption, encoding, compression, etc.) without dealing with complex tools.

**Key Technologies:**
- **Core:** JavaScript (ES Modules)
- **Build System:** Grunt, Webpack
- **Testing:** Nightwatch (UI), Custom Node runners
- **Runtime:** Browser (primary), Node.js (supported)

## Environment Setup
- **Node.js:** Requires Node.js v16+.
- **Dependencies:** `npm install` (triggers post-install scripts for crypto and UI fixes).

## Key Commands

### Development
- **Start Dev Server:** `npm start` (Runs `npx grunt dev`) - Serves locally with live reload.
- **Build Production:** `npm run build` (Runs `npx grunt prod`) - Compiles minified assets.
- **Lint Code:** `npm run lint` (Runs `npx grunt lint`).

### Testing
- **Run All Tests:** `npm test` (Config tests, Node tests, Operation tests).
- **Run UI Tests:** `npm run testui` (Nightwatch).
- **Run Node Consumer Tests:** `npm run testnodeconsumer`.

### Operations
- **Create New Operation:** `npm run newop` - Interactive script to scaffold a new operation.
- **Update Minor Version:** `npm run minor`.

## Architecture
- **`src/core/`**: Contains the business logic.
    - `Chef.mjs`: Main controller.
    - `Recipe.mjs`: Manages a list of operations.
    - `Dish.mjs`: Represents the input/output data.
    - `operations/`: Individual operation implementations.
- **`src/web/`**: Frontend interface code.
- **`src/node/`**: Node.js specific wrappers and API.

## Development Conventions
- **Indentation:** 4 spaces.
- **Naming:**
    - Objects/Namespaces: `CamelCase`
    - Functions/Variables: `camelCase`
    - Constants: `UNDERSCORE_UPPER_CASE`
- **Design Principles:**
    - **Client-Side First:** Operations should run entirely in the browser/client. Avoid external API calls.
    - **Efficiency:** Minimize latency. Load large dependencies lazily/modularly.
    - **Vanilla JS:** Prefer native APIs over frameworks like jQuery where possible.
- **File Endings:** UNIX style (`\n`).

## Adding a New Operation
1. Run `npm run newop`.
2. Follow the prompts to define the operation name, description, and arguments.
3. Implement the logic in the generated file under `src/core/operations/`.
4. Add tests in `tests/operations/tests/`.
