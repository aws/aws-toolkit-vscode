/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as assert from 'assert'
import * as vscode from 'vscode'
import * as buttons from '../../../shared/ui/buttons'
import { FakeExtensionContext } from '../../fakeExtensionContext'

describe('UI buttons', () => {

    const extContext = new FakeExtensionContext()

    it('creates a help button without a tooltip or icons', () => {
        const help = buttons.createHelpButton(extContext)
        const paths = help.iconPath as {light: vscode.Uri, dark: vscode.Uri}

        assert.strictEqual(help.tooltip, undefined)
        assert.ok(paths.light)
        assert.ok(paths.dark)
    })

    it('creates a help button with a tooltip', () => {
        const tooltip = 'you must be truly desperate to come to me for help'
        const help = buttons.createHelpButton(extContext, tooltip)

        assert.strictEqual(help.tooltip, tooltip)
    })
})
