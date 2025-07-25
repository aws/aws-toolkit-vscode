## UI Testing

UI tests use [vscode-extension-tester](https://github.com/redhat-developer/vscode-extension-tester) to test the Amazon Q extension in a real VS Code environment.

### Quick Start

```bash
# Run complete UI test suite
npm run test:ui
```

Note: All of these commands must be run at the root level aws-toolkit-vscode directory.

### Individual Commands

#### `test:ui:prepare`

Downloads VS Code and ChromeDriver to `~/.vscode-test-resources` in order to properly hook Selenium/VET to our new VSCode instance we launch. Without this, test cannot be run at all.

```bash
npm run test:ui:prepare
```

#### `test:ui:install`

Packages the Amazon Q extension VSIX and installs it for testing. This reflects local changes within your immediate aws-toolkit-vscode directory.

```bash
npm run test:ui:install
```

-   Runs `npm run package` in amazonq directory
-   Extracts version from build output
-   Installs VSIX using `extest install-vsix`
-   Sets up extension in test environment

#### `test:ui:run`

Compiles TypeScript and runs UI tests within the dist directory. You must run this everytime you make a new change to your tests in order to recompile them.

```bash
npm run test:ui:run
```

-   Compiles test files with `npm run testCompile`
-   Runs tests matching `packages/amazonq/dist/test/e2e_new/amazonq/tests/*.js`

#### Authentication

Currently, authentication is not configured to be automatically logged into AmazonQ. To bypass this for now (as of July 24th, 2025), you must click the approve/open button that redirects you to a browser in order for tests to be run in an authenticated environment at the start of a new.

```bash
npm run test:ui:run
```

#### Test Categories

-   **Chat** - Amazon Q chat functionality
-   **Pin Context** - Context pinning features
-   **Quick Actions** - Quick action commands
-   **Switch Model** - Model switching functionality

### Writing New Tests

1. Create test files in `packages/amazonq/test/e2e_new/amazonq/tests/`
2. Import utilities from `../utils/`
3. Use helpers from `../helpers/`
4. Follow existing patterns for setup/cleanup

#### Writing New Helpers

1. Plan out abstractions/helpers after confirming current helpers are not viable
2. Create helper file in `../helpers/`
3. Following existing pattens for helper conventions and parameters

#### Example Test Structure

```typescript
import { describe, it, before, after } from 'mocha'
import { setupTestContext, cleanupTestContext } from '../utils/setup'

describe('Feature Tests', () => {
    before(async () => {
        await setupTestContext()
    })

    after(async () => {
        await cleanupTestContext()
    })

    it('should test functionality', async () => {
        // Test implementation
    })
})
```

### Prerequisites

-   Node.js and npm
-   VS Code extension development environment
-   Chrome/Chromium browser

### Troubleshooting

#### Common Issues

-   **VS Code download fails**: Check internet connection, retry `test:ui:prepare`
-   **Extension install fails**: Ensure packaging succeeds
-   **Tests won't start**: Verify ChromeDriver/Chrome compatibility
-   **Permission errors**: Check `~/.vscode-test-resources` permissions

#### Reset

```bash
# Reset test environment
rm -rf ~/.vscode-test-resources
npm run test:ui:prepare
```

### Test Development Tips

-   Tests should be independent and run in any order
-   Use existing utilities for common operations
-   Clean up resources in `after` hooks
-   Follow naming conventions from existing tests
