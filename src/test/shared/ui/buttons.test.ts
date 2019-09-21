/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as vscode from 'vscode'
import { ext } from '../../../shared/extensionGlobals'
import * as buttons from '../../../shared/ui/buttons'

describe.only('UI buttons', () => {
    const expectedHelpDarkPath = '/icons/dark/help'
    const expectedHelpLightPath = '/icons/light/help'

    before(() => {
        ext.iconPaths.helpDark = expectedHelpDarkPath
        ext.iconPaths.helpLight = expectedHelpLightPath
    })

    after(() => {
        delete ext.iconPaths.helpDark
        delete ext.iconPaths.helpLight
    })

    it('creates a help button without a tooltip', () => {
        const help = buttons.createHelpButton()

        assert.strictEqual(help.tooltip, undefined)
        assertIconPath(help.iconPath as { light: vscode.Uri; dark: vscode.Uri })
    })

    it('creates a help button with a tooltip', () => {
        const tooltip = 'you must be truly desperate to come to me for help'
        const help = buttons.createHelpButton(tooltip)

        assert.strictEqual(help.tooltip, tooltip)
        assertIconPath(help.iconPath as { light: vscode.Uri; dark: vscode.Uri })
    })

    function assertIconPath(iconPath: { light: vscode.Uri; dark: vscode.Uri }) {
        assert.strictEqual(iconPath.dark.path, expectedHelpDarkPath)
        assert.strictEqual(iconPath.light.path, expectedHelpLightPath)
    }
})
