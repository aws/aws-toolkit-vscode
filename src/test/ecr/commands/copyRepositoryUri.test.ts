/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { EcrRepositoryNode } from '../../../ecr/explorer/ecrRepositoryNode'
import { FakeEnv } from '../../shared/vscode/fakeEnv'
import { EcrNode } from '../../../ecr/explorer/ecrNode'
import { EcrClient, EcrRepository } from '../../../shared/clients/ecrClient'
import { copyRepositoryUri } from '../../../ecr/commands/copyRepositoryUri'
import { getTestWindow } from '../../shared/vscode/window'

describe('copyUriCommand', function () {
    it('Copies URI to clipboard and shows in the status bar', async function () {
        const node = new EcrRepositoryNode(
            {} as EcrNode,
            {} as EcrClient,
            { repositoryUri: 'www.amazon.com' } as EcrRepository
        )

        const env = new FakeEnv()

        await copyRepositoryUri(node, env)

        assert.strictEqual(env.clipboard.text, 'www.amazon.com')
        assert.deepStrictEqual(getTestWindow().statusBar.messages, ['$(clippy) Copied URI to clipboard'])
    })
})
