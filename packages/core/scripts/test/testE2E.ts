/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { runToolkitTests } from './launchTestUtilities'
void (async () => {
    const relativeEntrypoint = process.argv[2]
    if (!relativeEntrypoint) {
        throw new Error('Relative entrypoint is required')
    }

    const relativeWorkspaceFolder = process.argv[3]
    await runToolkitTests('e2e', relativeEntrypoint, relativeWorkspaceFolder)
})()
