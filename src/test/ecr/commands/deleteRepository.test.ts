/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as sinon from 'sinon'
import * as assert from 'assert'
import { EcrNode } from '../../../ecr/explorer/ecrNode'
import { DefaultEcrClient, EcrRepository } from '../../../shared/clients/ecrClient'
import { FakeCommands } from '../../shared/vscode/fakeCommands'
import { EcrRepositoryNode } from '../../../ecr/explorer/ecrRepositoryNode'
import { deleteRepository } from '../../../ecr/commands/deleteRepository'
import { getTestWindow } from '../../shared/vscode/window'

describe('deleteRepositoryCommand', function () {
    const repositoryName = 'reponame'
    const parentNode: EcrNode = {} as EcrNode
    const ecr = new DefaultEcrClient('')
    let node: EcrRepositoryNode
    let sandbox: sinon.SinonSandbox

    beforeEach(function () {
        sandbox = sinon.createSandbox()
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
        const commands = new FakeCommands()
        const stub = sandbox.stub(ecr, 'deleteRepository').callsFake(async name => {
            assert.strictEqual(name, repositoryName)
        })

        await deleteRepository(node, commands)

        getTestWindow().getFirstMessage().assertInfo(`Deleted repository: ${repositoryName}`)

        assert.strictEqual(stub.calledOnce, true)

        assert.strictEqual(commands.command, 'aws.refreshAwsExplorerNode')
        assert.deepStrictEqual(commands.args, [parentNode])
    })

    it('Does nothing when deletion is cancelled', async function () {
        getTestWindow().onDidShowInputBox(input => input.hide())
        const spy = sandbox.spy(ecr, 'deleteRepository')

        await deleteRepository(node, new FakeCommands())

        assert.ok(spy.notCalled)
    })

    it('shows an error message and refreshes node when repository deletion fails', async function () {
        sandbox.stub(ecr, 'deleteRepository').callsFake(async () => {
            throw Error('Network busted')
        })

        getTestWindow().onDidShowInputBox(input => input.acceptValue(repositoryName))
        const commands = new FakeCommands()
        await deleteRepository(node, commands)

        getTestWindow().getFirstMessage().assertError(`Failed to delete repository: ${repositoryName}`)

        assert.strictEqual(commands.command, 'aws.refreshAwsExplorerNode')
        assert.deepStrictEqual(commands.args, [parentNode])
    })

    it('Warns when confirmation is invalid', async function () {
        getTestWindow().onDidShowInputBox(input => {
            input.acceptValue('something other than the repo name')
            assert.strictEqual(input.validationMessage, `Enter ${repositoryName} to confirm deletion`)
            input.hide()
        })
        const commands = new FakeCommands()

        await deleteRepository(node, commands)
    })
})
