/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { EcrRepositoryNode } from '../../../ecr/explorer/ecrRepositoryNode'
import { FakeEnv } from '../../shared/vscode/fakeEnv'
import { EcrClient, EcrRepository } from '../../../shared/clients/ecrClient'
import { EcrTagNode } from '../../../ecr/explorer/ecrTagNode'
import { copyTagUri } from '../../../ecr/commands/copyTagUri'
import { getTestWindow } from '../../shared/vscode/window'

describe('copyTagUriCommand', function () {
    it('Copies URI to clipboard and shows in the status bar', async function () {
        const parentNode = {} as EcrRepositoryNode
        const node = new EcrTagNode(
            parentNode,
            {} as EcrClient,
            { repositoryUri: 'www.amazon.com' } as EcrRepository,
            'tag'
        )

        const env = new FakeEnv()

        await copyTagUri(node, env)

        assert.strictEqual(env.clipboard.text, 'www.amazon.com:tag')
        assert.deepStrictEqual(getTestWindow().statusBar.messages, ['$(clippy) Copied URI to clipboard'])
    })
})
