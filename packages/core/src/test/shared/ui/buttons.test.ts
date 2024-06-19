/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as buttons from '../../../shared/ui/buttons'

describe('UI buttons', function () {
    it('creates a help button with a tooltip', function () {
        const tooltip = 'you must be truly desperate to come to me for help'
        const help = buttons.createHelpButton('', tooltip)

        assert.strictEqual(help.tooltip, tooltip)
    })

    it('creates a help button with a url', function () {
        const url = 'http://fake.url/'
        const help = buttons.createHelpButton(url)

        assert.strictEqual(help.uri.toString(), url)
    })
})
