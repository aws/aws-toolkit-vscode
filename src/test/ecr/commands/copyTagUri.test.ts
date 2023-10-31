/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as sinon from 'sinon'
import * as vscode from 'vscode'
import { EcrRepositoryNode } from '../../../ecr/explorer/ecrRepositoryNode'
import { EcrClient, EcrRepository } from '../../../shared/clients/ecrClient'
import { EcrTagNode } from '../../../ecr/explorer/ecrTagNode'
import { copyTagUri } from '../../../ecr/commands/copyTagUri'
import { getTestWindow } from '../../shared/vscode/window'
import { FakeClipboard } from '../../shared/vscode/fakeEnv'

describe('copyTagUriCommand', function () {
    beforeEach(function () {
        const fakeClipboard = new FakeClipboard()
        sinon.stub(vscode.env, 'clipboard').value(fakeClipboard)
    })

    it('Copies URI to clipboard and shows in the status bar', async function () {
        const parentNode = {} as EcrRepositoryNode
        const node = new EcrTagNode(
            parentNode,
            {} as EcrClient,
            { repositoryUri: 'www.amazon.com' } as EcrRepository,
            'tag'
        )

        await copyTagUri(node)

        assert.strictEqual(await vscode.env.clipboard.readText(), 'www.amazon.com:tag')
        assert.deepStrictEqual(getTestWindow().statusBar.messages, ['$(clippy) Copied URI to clipboard'])
    })
})
