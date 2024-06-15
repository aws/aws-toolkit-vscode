/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { runToolkitTests } from './launchTestUtilities'
void (async () => {
    const relativeEntrypoint = process.argv[2]
    if (!relativeEntrypoint) {
        throw new Error('A path relative to core is required')
    }

    const relativeWorkspaceFolder = process.argv[3]
    await runToolkitTests('unit', relativeEntrypoint, relativeWorkspaceFolder)
})()
