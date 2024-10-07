/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { globals, ToolkitGlobals } from 'aws-core-vscode/shared'

describe('activation', async () => {
    it('defines a region provider that can provide regions when in web mode', async () => {
        assert((globals as unknown as ToolkitGlobals).regionProvider.getRegions().length > 0)
    })
})
