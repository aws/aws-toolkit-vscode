/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { EcrRepositoryNode } from '../../../ecr/explorer/ecrRepositoryNode'
import { FakeEnv } from '../../shared/vscode/fakeEnv'
import { FakeWindow } from '../../shared/vscode/fakeWindow'
import { EcrClient, EcrRepository } from '../../../shared/clients/ecrClient'
import { EcrTagNode } from '../../../ecr/explorer/ecrTagNode'
import { copyTagUri } from '../../../ecr/commands/copyTagUri'

describe('copyTagUriCommand', () => {
    it('Copies URI to clipboard and shows in the status bar', async () => {
        const parentNode = {} as EcrRepositoryNode
        const node = new EcrTagNode(
            parentNode,
            {} as EcrClient,
            { repositoryUri: 'www.amazon.com' } as EcrRepository,
            'tag'
        )

        const window = new FakeWindow()
        const env = new FakeEnv()

        await copyTagUri(node, window, env)

        assert.strictEqual(env.clipboard.text, 'www.amazon.com:tag')

        assert.strictEqual(window.statusBar.message, '$(clippy) Copied URI to clipboard')
    })
})
