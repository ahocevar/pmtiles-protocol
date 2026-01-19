# Copilot Instructions for `pmtiles-protocol`

## Project Overview

This is a JavaScript library that enables `pmtiles://` protocol support in browser environments by intercepting and wrapping global `fetch` and `XMLHttpRequest` APIs. It acts as a bridge between the browser's network layer and the `pmtiles` library.

## Architecture & Core Concepts

- **Interception Strategy**: Uses JavaScript `Proxy` to wrap `globalThis.fetch` and extend `XMLHttpRequest`.
- **Protocol Handling**:
  - Intercepts URLs starting with `pmtiles://`.
  - Resolves them using the `pmtiles` library (parsing TileJSON or specific Z/X/Y tiles).
  - Falls through to original native implementations for all other protocols (http/https).
- **State Management**:
  - Maintains a module-level cache `pmtilesByUrl` to persist `PMTiles` instances across requests.
- **Key Files**:
  - `index.js`: Contains the entire implementation (fetch proxy, XHR shim, registry logic).
  - `index.d.ts`: Generated type definitions (do not edit manually, generated via `tsc`).
  - `test/index.test.js`: Functional tests using Vitest.
  - `test/setup.js`: Test setup, including a mock `fetch` implementation to serve local fixtures.
  - `scripts/generate-fixtures.js`: Node.js script to generate minimal PMTiles v3 archives for testing.

## Tech Stack & Tooling

- **Language**: JavaScript (ESM).
- **Type System**: **JSDoc + TypeScript**.
  - Source code is `.js`.
  - Types are defined via JSDoc comments (`/** @type {string} */`).
  - `tsconfig.json` is configured with `allowJs: true`, `checkJs: true`, and `emitDeclarationOnly: true`.
  - **Rule**: Do not create `.ts` files. Use standard JavaScript with correct JSDoc annotations to satisfy the compiler.
- **Dependencies**: `pmtiles` (core logic).
- **Testing**: `vitest`, `happy-dom` (for browser environment), `eslint`, `prettier`.

## Development Workflows

- **Validation & Testing**:
  - Run `npm test` to run the full validation suite.
    - This automatically runs `npm run generate-fixtures` (creating `test/fixtures/*.pmtiles`).
    - Runs linting (`eslint`, `prettier`, `tsc`).
    - Runs unit/functional tests via `vitest`.
- **Linting**:
  - Run `npm run lint` to check code style and types without running tests.
- **Building**:
  - `npm run prepublishOnly` runs `tsc` to generate `index.d.ts` and source maps.

## Testing Strategy

- **Environment**: Tests run in `happy-dom` to simulate a browser environment.
- **Fixtures**: `scripts/generate-fixtures.js` creates minimal valid PMTiles archives (MVT and PNG) in `test/fixtures/`. These are ignored by git.
- **Mocking**: `test/setup.js` overrides `globalThis.fetch` to serve files from `test/fixtures/` when requests are made to specific test filenames, supporting Range requests which are required by the `pmtiles` library.
- **Test Structure**: Tests in `test/index.test.js` verify interception of `fetch`, `Image`, and `XMLHttpRequest` for `pmtiles://` URLs.

## Coding Conventions

1.  **Type Safety**:
    - All functions and complex variables MUST have JSDoc annotations.
    - Use `@ts-expect-error` sparingly and only when necessary for patching native APIs (e.g., inside the XHR proxy).
2.  **Browser APIs**:
    - Access globals via `globalThis` (e.g., `globalThis.fetch`) to ensure safety in different JS environments.
    - Handle native API signatures carefully (e.g., `fetch` accepts `Request` objects or strings).
3.  **Modern JS**:
    - Use ES2022+ features (as configured in `tsconfig.json`).
    - Prefer `const`/`let` over `var`.

## release

- Manual versioning in `package.json`.
