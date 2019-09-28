/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { ext } from '../../../shared/extensionGlobals'
import * as buttons from '../../../shared/ui/buttons'
import { clearTestIconPaths, IconPath, setupTestIconPaths } from '../utilities/iconPathUtils'

describe('UI buttons', () => {
    before(() => {
        setupTestIconPaths()
    })

    after(() => {
        clearTestIconPaths()
    })

    it('creates a help button without a tooltip', () => {
        const help = buttons.createHelpButton()

        assert.strictEqual(help.tooltip, undefined)
        assertIconPath(help.iconPath as IconPath)
    })

    it('creates a help button with a tooltip', () => {
        const tooltip = 'you must be truly desperate to come to me for help'
        const help = buttons.createHelpButton(tooltip)

        assert.strictEqual(help.tooltip, tooltip)
        assertIconPath(help.iconPath as IconPath)
    })

    function assertIconPath(iconPath: IconPath) {
        assert.strictEqual(iconPath.dark.path, ext.iconPaths.dark.help)
        assert.strictEqual(iconPath.light.path, ext.iconPaths.light.help)
    }
})
