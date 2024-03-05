/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { CodeWhispererUserGroupSettings } from '../../../codewhisperer/util/userGroupUtil'
import * as CodeWhispererConstants from '../../../codewhisperer/models/constants'
import globals from '../../../shared/extensionGlobals'
import { extensionVersion } from '../../../shared/vscode/env'

describe('getCodeWhispererUserGroup', function () {
    afterEach(function () {
        CodeWhispererUserGroupSettings.instance.reset()
    })

    it('getUserGroup should set the group and version if there is none', async function () {
        await globals.context.globalState.update(CodeWhispererConstants.userGroupKey, undefined)

        assert.ok(!globals.context.globalState.get(CodeWhispererConstants.userGroupKey))

        assert.ok(CodeWhispererUserGroupSettings.getUserGroup())
        assert.ok(CodeWhispererUserGroupSettings.instance.version)

        assert.ok(CodeWhispererUserGroupSettings.getUserGroup())
        assert.ok(CodeWhispererUserGroupSettings.instance.version)

        assert.ok(CodeWhispererUserGroupSettings.getUserGroup())
        assert.ok(CodeWhispererUserGroupSettings.instance.version)
    })

    it('should return the same result', async function () {
        await globals.context.globalState.update(CodeWhispererConstants.userGroupKey, undefined)

        const group0 = CodeWhispererUserGroupSettings.getUserGroup()
        const group1 = CodeWhispererUserGroupSettings.getUserGroup()
        const group2 = CodeWhispererUserGroupSettings.getUserGroup()
        const group3 = CodeWhispererUserGroupSettings.getUserGroup()

        assert.strictEqual(group0, group1)
        assert.strictEqual(group1, group2)
        assert.strictEqual(group2, group3)
        assert.strictEqual(group3, group0)
    })

    it('should return result stored in the extension context if the plugin version remains the same', async function () {
        await globals.context.globalState.update(CodeWhispererConstants.userGroupKey, {
            group: CodeWhispererConstants.UserGroup.Control,
            version: extensionVersion,
        })

        assert.strictEqual(CodeWhispererUserGroupSettings.getUserGroup(), CodeWhispererConstants.UserGroup.Control)

        // 2nd time should still the same result
        assert.strictEqual(CodeWhispererUserGroupSettings.getUserGroup(), CodeWhispererConstants.UserGroup.Control)
    })

    it('should return different result if the plugin version is not the same', async function () {
        await globals.context.globalState.update(CodeWhispererConstants.userGroupKey, {
            group: CodeWhispererConstants.UserGroup.Control,
            version: 'fake-extension-version',
        })

        CodeWhispererUserGroupSettings.getUserGroup()
        assert.strictEqual(CodeWhispererUserGroupSettings.instance.version, extensionVersion)
        assert.ok(CodeWhispererUserGroupSettings.instance.userGroup)
    })
})
