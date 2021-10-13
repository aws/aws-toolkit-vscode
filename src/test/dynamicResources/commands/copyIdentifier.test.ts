/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { copyIdentifier } from '../../../dynamicResources/commands/copyIdentifier'
import { FakeEnv } from '../../shared/vscode/fakeEnv'
import { FakeWindow } from '../../shared/vscode/fakeWindow'

describe('copyIdentifierCommand', function () {
    let window: FakeWindow
    let env: FakeEnv

    beforeEach(function () {
        window = new FakeWindow()
        env = new FakeEnv()
    })

    it('copies identifier to clipboard and shows status bar confirmation', async function () {
        const fakeIdentifier = 'resource1'

        await copyIdentifier('fakeResourceType', fakeIdentifier, window, env)

        assert.strictEqual(env.clipboard.text, fakeIdentifier)
        assert.strictEqual(window.message.error, undefined)
    })
})
