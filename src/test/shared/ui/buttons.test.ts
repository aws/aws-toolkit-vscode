/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { ext } from '../../../shared/extensionGlobals'
import * as buttons from '../../../shared/ui/buttons'
import { clearTestIconPaths, IconPath, setupTestIconPaths } from '../utilities/iconPathUtils'

describe('UI buttons', function () {
    before(function () {
        setupTestIconPaths()
    })

    after(function () {
        clearTestIconPaths()
    })

    it('creates a help button without a tooltip', function () {
        const help = buttons.createHelpButton()

        assert.strictEqual(help.tooltip, undefined)
        assertIconPath(help.iconPath as IconPath)
    })

    it('creates a help button with a tooltip', function () {
        const tooltip = 'you must be truly desperate to come to me for help'
        const help = buttons.createHelpButton(tooltip)

        assert.strictEqual(help.tooltip, tooltip)
        assertIconPath(help.iconPath as IconPath)
    })

    it('creates a help button with a url', function () {
        const url = 'http://fake.url'
        const help = buttons.createHelpButton(undefined, url)

        assert.strictEqual(help.url, url)
        assertIconPath(help.iconPath as IconPath)
    })

    function assertIconPath(iconPath: IconPath) {
        assert.strictEqual(iconPath.dark.path, ext.iconPaths.dark.help)
        assert.strictEqual(iconPath.light.path, ext.iconPaths.light.help)
    }
})
