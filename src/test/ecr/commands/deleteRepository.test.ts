/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as sinon from 'sinon'
import assert from 'assert'
import { EcrNode } from '../../../ecr/explorer/ecrNode'
import { DefaultEcrClient, EcrRepository } from '../../../shared/clients/ecrClient'
import { EcrRepositoryNode } from '../../../ecr/explorer/ecrRepositoryNode'
import { deleteRepository } from '../../../ecr/commands/deleteRepository'
import { getTestWindow } from '../../shared/vscode/window'

describe('deleteRepositoryCommand', function () {
    const repositoryName = 'reponame'
    const parentNode: EcrNode = {} as EcrNode
    const ecr = new DefaultEcrClient('')
    let node: EcrRepositoryNode
    let sandbox: sinon.SinonSandbox
    let spyExecuteCommand: sinon.SinonSpy

    beforeEach(function () {
        sandbox = sinon.createSandbox()
        spyExecuteCommand = sandbox.spy(vscode.commands, 'executeCommand')
        node = new EcrRepositoryNode(parentNode, ecr, { repositoryName: repositoryName } as EcrRepository)
    })

    afterEach(function () {
        sandbox.restore()
    })

    it('Confirms deletion, deletes repository, shows progress bar, and refreshes parent node', async function () {
        getTestWindow().onDidShowInputBox(input => {
            assert.strictEqual(input.prompt, `Enter ${repositoryName} to confirm deletion`)
            assert.strictEqual(input.placeholder, repositoryName)
            input.acceptValue(repositoryName)
        })
        const stub = sandbox.stub(ecr, 'deleteRepository').callsFake(async name => {
            assert.strictEqual(name, repositoryName)
        })

        await deleteRepository(node)

        getTestWindow().getFirstMessage().assertInfo(`Deleted repository: ${repositoryName}`)
        assert.strictEqual(stub.calledOnce, true)
        sandbox.assert.calledWith(spyExecuteCommand, 'aws.refreshAwsExplorerNode', parentNode)
    })

    it('Does nothing when deletion is cancelled', async function () {
        getTestWindow().onDidShowInputBox(input => input.hide())
        const spy = sandbox.spy(ecr, 'deleteRepository')

        await deleteRepository(node)

        assert.ok(spy.notCalled)
    })

    it('shows an error message and refreshes node when repository deletion fails', async function () {
        sandbox.stub(ecr, 'deleteRepository').callsFake(async () => {
            throw Error('Network busted')
        })

        getTestWindow().onDidShowInputBox(input => input.acceptValue(repositoryName))
        await deleteRepository(node)

        getTestWindow().getFirstMessage().assertError(`Failed to delete repository: ${repositoryName}`)
        sandbox.assert.calledWith(spyExecuteCommand, 'aws.refreshAwsExplorerNode', parentNode)
    })

    it('Warns when confirmation is invalid', async function () {
        getTestWindow().onDidShowInputBox(input => {
            input.acceptValue('something other than the repo name')
            assert.strictEqual(input.validationMessage, `Enter ${repositoryName} to confirm deletion`)
            input.hide()
        })

        await deleteRepository(node)
    })
})
