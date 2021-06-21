/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as assert from 'assert'
import * as sinon from 'sinon'
import { ext } from '../../../shared/extensionGlobals'
import * as buttons from '../../../shared/ui/buttons'
import { clearTestIconPaths, IconPath, setupTestIconPaths } from '../utilities/iconPathUtils'

describe('UI buttons', function () {
    let sandbox: sinon.SinonSandbox

    before(function () {
        setupTestIconPaths()
        sandbox = sinon.createSandbox()
    })

    after(function () {
        clearTestIconPaths()
        sandbox.restore()
    })

    it('creates a help button with a link', async function () {
        const help = buttons.createHelpButton('link')

        const clickPromise = new Promise<void>((resolve, reject) => {
            sandbox.stub(vscode.env, 'openExternal').callsFake(async uri => {
                try {
                    assert.strictEqual(uri.path, '/link')
                    resolve()
                } catch (e) { 
                    reject(e) 
                }
                return true
            })
        })
    
        assertIconPath(help.iconPath as IconPath)
        help.onClick!()

        return clickPromise
    })

    it('creates a help button with a tooltip', function () {
        const tooltip = 'you must be truly desperate to come to me for help'
        const help = buttons.createHelpButton('', tooltip)

        assert.strictEqual(help.tooltip, tooltip)
        assertIconPath(help.iconPath as IconPath)
    })

    function assertIconPath(iconPath: IconPath) {
        assert.strictEqual(iconPath.dark.path, ext.iconPaths.dark.help)
        assert.strictEqual(iconPath.light.path, ext.iconPaths.light.help)
    }
})
