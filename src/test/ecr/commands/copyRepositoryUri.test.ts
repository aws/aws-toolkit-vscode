/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { EcrRepositoryNode } from '../../../ecr/explorer/ecrRepositoryNode'
import { FakeEnv } from '../../shared/vscode/fakeEnv'
import { FakeWindow } from '../../shared/vscode/fakeWindow'
import { EcrNode } from '../../../ecr/explorer/ecrNode'
import { EcrClient, EcrRepository } from '../../../shared/clients/ecrClient'
import { copyRepositoryUri } from '../../../ecr/commands/copyRepositoryUri'

describe('copyUriCommand', () => {
    it('Copies URI to clipboard and shows in the status bar', async () => {
        const node = new EcrRepositoryNode(
            {} as EcrNode,
            {} as EcrClient,
            { repositoryUri: 'www.amazon.com' } as EcrRepository
        )

        const window = new FakeWindow()
        const env = new FakeEnv()

        await copyRepositoryUri(node, window, env)

        assert.strictEqual(env.clipboard.text, 'www.amazon.com')

        assert.strictEqual(window.statusBar.message, '$(clippy) Copied URI to clipboard')
    })
})
