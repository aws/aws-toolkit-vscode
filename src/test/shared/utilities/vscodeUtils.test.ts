/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { VSCODE_EXTENSION_ID } from '../../../shared/extensions'
import * as vscodeUtil from '../../../shared/utilities/vsCodeUtils'

describe('vscodeUtils', async function () {
    it('activateExtension(), isExtensionActive()', async function () {
        assert.deepStrictEqual(await vscodeUtil.activateExtension('invalid.extension'), undefined)
        await assert.rejects(async () => {
            await vscodeUtil.activateExtension('invalid', false)
        })

        assert.deepStrictEqual(vscodeUtil.isExtensionActive('invalid.extension'), false)

        await vscodeUtil.activateExtension(VSCODE_EXTENSION_ID.awstoolkit, false)
        assert.deepStrictEqual(vscodeUtil.isExtensionActive(VSCODE_EXTENSION_ID.awstoolkit), true)
    })
})
