/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { runToolkitTests } from './launchTestUtilities'
void (async () => {
    const relativeWorkspaceFolder = process.argv[2]

    // Should be executed from a subproject/extension
    await runToolkitTests('web', '../core/dist/src/testWeb/testRunnerWebCore.js', relativeWorkspaceFolder)
})()
