/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import globals from '../../../shared/extensionGlobals'
import * as buttons from '../../../shared/ui/buttons'
import { clearTestIconPaths, IconPath, setupTestIconPaths } from '../utilities/iconPathUtils'

describe('UI buttons', function () {
    before(function () {
        setupTestIconPaths()
    })

    after(function () {
        clearTestIconPaths()
    })

    it('creates a help button with a tooltip', function () {
        const tooltip = 'you must be truly desperate to come to me for help'
        const help = buttons.createHelpButton('', tooltip)

        assert.strictEqual(help.tooltip, tooltip)
        assertIconPath(help.iconPath as IconPath)
    })

    it('creates a help button with a url', function () {
        const url = 'http://fake.url/'
        const help = buttons.createHelpButton(url)

        assert.strictEqual(help.uri.toString(), url)
        assertIconPath(help.iconPath as IconPath)
    })

    function assertIconPath(iconPath: IconPath) {
        assert.strictEqual(iconPath.dark.path, globals.iconPaths.dark.help)
        assert.strictEqual(iconPath.light.path, globals.iconPaths.light.help)
    }
})
