/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as sinon from 'sinon'
import * as vscode from 'vscode'
import { EcrRepositoryNode } from '../../../ecr/explorer/ecrRepositoryNode'
import { EcrNode } from '../../../ecr/explorer/ecrNode'
import { EcrClient, EcrRepository } from '../../../shared/clients/ecrClient'
import { copyRepositoryUri } from '../../../ecr/commands/copyRepositoryUri'
import { getTestWindow } from '../../shared/vscode/window'
import { FakeClipboard } from '../../shared/vscode/fakeEnv'

describe('copyUriCommand', function () {
    beforeEach(function () {
        const fakeClipboard = new FakeClipboard()
        sinon.stub(vscode.env, 'clipboard').value(fakeClipboard)
    })

    it('Copies URI to clipboard and shows in the status bar', async function () {
        const node = new EcrRepositoryNode(
            {} as EcrNode,
            {} as EcrClient,
            { repositoryUri: 'www.amazon.com' } as EcrRepository
        )

        await copyRepositoryUri(node)

        assert.strictEqual(await vscode.env.clipboard.readText(), 'www.amazon.com')
        assert.deepStrictEqual(getTestWindow().statusBar.messages, ['$(clippy) Copied URI to clipboard'])
    })
})
