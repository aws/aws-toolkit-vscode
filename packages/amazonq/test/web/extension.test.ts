/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { ToolkitGlobals } from 'aws-core-vscode/shared'

describe('activation', async () => {
    it('defines a region provider that can provide regions when in web mode', async () => {
        // For some reason, a top-level import will result in undefined.
        // Other tests don't seem to have this issue.
        // TODO: why?
        const { globals } = require('aws-core-vscode/shared')

        assert((globals as unknown as ToolkitGlobals).regionProvider.getRegions().length > 0)
    })
})
