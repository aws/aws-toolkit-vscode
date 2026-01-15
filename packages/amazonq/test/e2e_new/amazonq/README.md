# Test Execution Guide

## Setup

```bash
npm install
```

## Running Tests

### UI Tests

```bash
npm run test:ui
```

### Rerun Tests Only (without code changes)

```bash
npm run test:ui:run
```

## Compilation

### Compile Test Files

```bash
npm run testCompile
```

## Single Test Execution

### Switch Model Test

```bash
npx extest run-tests -s ~/.vscode-test-resources -e packages/amazonq/test/e2e_new/amazonq/resources packages/amazonq/dist/test/e2e_new/amazonq/tests/switchModel.test.js
```

### Pin Context Test

```bash
npx extest run-tests -s ~/.vscode-test-resources -e packages/amazonq/test/e2e_new/amazonq/resources packages/amazonq/dist/test/e2e_new/amazonq/tests/pinContext.test.js
```

### Rules Test

```bash
npx extest run-tests -s ~/.vscode-test-resources -e packages/amazonq/test/e2e_new/amazonq/resources packages/amazonq/dist/test/e2e_new/amazonq/tests/rules.test.js
```

## Multiple Test Execution

### MCP + Pin Context

```bash
npx extest run-tests -s ~/.vscode-test-resources -e packages/amazonq/test/e2e_new/amazonq/resources packages/amazonq/dist/test/e2e_new/amazonq/tests/mcp.test.js packages/amazonq/dist/test/e2e_new/amazonq/tests/pinContext.test.js
```

### Quick Action + Rule

```bash
npx extest run-tests -s ~/.vscode-test-resources -e packages/amazonq/test/e2e_new/amazonq/resources packages/amazonq/dist/test/e2e_new/amazonq/tests/quickActions.test.js packages/amazonq/dist/test/e2e_new/amazonq/tests/rules.test.js
```

## Run All Tests

```bash
npx extest run-tests -s ~/.vscode-test-resources -e packages/amazonq/test/e2e_new/amazonq/resources packages/amazonq/dist/test/e2e_new/amazonq/tests/*.js
```
