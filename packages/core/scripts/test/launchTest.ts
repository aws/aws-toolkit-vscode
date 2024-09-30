/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * This script is used to run unit tests from an npm script defined in package.json.
 * TODO: Generalize and use named args system from root/scripts/package.ts
 *
 * Usage:
 * node ./test/runToolkitTests.js <suite_name> <relative path to entrypoint> <relative path to workspace folder>
 *
 * where:
 * - suite_name, e.g. 'unit', 'integration', 'e2e'
 * - relative path to entrypoint: test entry point file built in .js, e.g. 'amazonq/dist/test/unit/index.js'
 * - relative path to workspace folder: folder to open the test VSC instance in (optional)
 *
 * See examples in any subproject's package.json `test` scripts.
 */

import 'source-map-support/register'

import { runToolkitTests, SuiteName } from './launchTestUtilities'
void (async () => {
    const suiteName = process.argv[2] as SuiteName
    if (!suiteName) {
        throw new Error('A test suite name is required.')
    }

    const relativeEntrypoint = process.argv[3]
    if (!relativeEntrypoint) {
        throw new Error('A path relative to core is required.')
    }

    const relativeWorkspaceFolder = process.argv[4]
    await runToolkitTests(suiteName, relativeEntrypoint, relativeWorkspaceFolder)
})()
