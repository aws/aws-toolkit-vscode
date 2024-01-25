/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from "assert"
import { SystemUtilities } from "../../shared/systemUtilities"
import globals from "../../shared/extensionGlobals"

describe('SystemUtilities', function () {
    it('getHomeDirectory() when in Browser', function () {
        assert.strictEqual(SystemUtilities.getHomeDirectory(), globals.context.globalStorageUri.toString())
    })
})