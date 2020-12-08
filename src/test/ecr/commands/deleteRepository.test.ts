/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as sinon from 'sinon'
import * as assert from 'assert'
import { FakeWindow } from '../../shared/vscode/fakeWindow'
import { EcrNode } from '../../../ecr/explorer/ecrNode'
import { EcrClient, EcrRepository } from '../../../shared/clients/ecrClient'
import { MockEcrClient } from '../../shared/clients/mockClients'
import { FakeCommands } from '../../shared/vscode/fakeCommands'
import { EcrRepositoryNode } from '../../../ecr/explorer/ecrRepositoryNode'
import { deleteRepository } from '../../../ecr/commands/deleteRepository'

describe('deleteRepositoryCommand', () => {
    const repositoryName = 'reponame'
    const parentNode: EcrNode = {} as EcrNode
    const ecr: EcrClient = new MockEcrClient({})
    let node: EcrRepositoryNode
    let sandbox: sinon.SinonSandbox

    beforeEach(() => {
        sandbox = sinon.createSandbox()
        node = new EcrRepositoryNode(parentNode, ecr, { repositoryName: repositoryName } as EcrRepository)
    })

    afterEach(() => {
        sandbox.restore()
    })

    it('Confirms deletion, deletes repository, shows progress bar, and refreshes parent node', async () => {
        const window = new FakeWindow({ inputBox: { input: repositoryName } })
        const commands = new FakeCommands()
        const stub = sandbox.stub(ecr, 'deleteRepository').callsFake(async name => {
            assert.strictEqual(name, repositoryName)
        })

        await deleteRepository(node, window, commands)

        assert.strictEqual(window.inputBox.options?.prompt, `Enter ${repositoryName} to confirm deletion`)
        assert.strictEqual(window.inputBox.options?.placeHolder, repositoryName)

        assert.ok(window.message.information?.startsWith(`Deleted repository ${repositoryName}`))

        assert.strictEqual(stub.calledOnce, true)

        assert.strictEqual(commands.command, 'aws.refreshAwsExplorerNode')
        assert.deepStrictEqual(commands.args, [parentNode])
    })

    it('Does nothing when deletion is cancelled', async () => {
        const spy = sandbox.spy(ecr, 'deleteRepository')

        await deleteRepository(node, new FakeWindow(), new FakeCommands())

        assert.ok(spy.notCalled)
    })

    it('shows an error message and refreshes node when repository deletion fails', async () => {
        sandbox.stub(ecr, 'deleteRepository').callsFake(async () => {
            throw Error('Network busted')
        })

        const window = new FakeWindow({ inputBox: { input: repositoryName } })
        const commands = new FakeCommands()
        await deleteRepository(node, window, commands)

        assert.ok(window.message.error?.startsWith(`Failed to delete repository ${repositoryName}`))

        assert.strictEqual(commands.command, 'aws.refreshAwsExplorerNode')
        assert.deepStrictEqual(commands.args, [parentNode])
    })

    it('Warns when confirmation is invalid', async () => {
        const window = new FakeWindow({ inputBox: { input: 'something other than the repo name' } })
        const commands = new FakeCommands()

        await deleteRepository(node, window, commands)

        assert.strictEqual(window.inputBox.errorMessage, `Enter ${repositoryName} to confirm deletion`)
    })
})
