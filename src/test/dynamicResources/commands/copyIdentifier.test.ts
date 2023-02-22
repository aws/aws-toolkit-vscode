/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { copyIdentifier } from '../../../dynamicResources/commands/copyIdentifier'
import { FakeEnv } from '../../shared/vscode/fakeEnv'
import { assertNoErrorMessages } from '../../shared/vscode/window'

describe('copyIdentifierCommand', function () {
    let env: FakeEnv

    beforeEach(function () {
        env = new FakeEnv()
    })

    it('copies identifier to clipboard and shows status bar confirmation', async function () {
        const fakeIdentifier = 'resource1'

        await copyIdentifier('fakeResourceType', fakeIdentifier, env)

        assert.strictEqual(env.clipboard.text, fakeIdentifier)
        assertNoErrorMessages()
    })
})
