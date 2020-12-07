/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as sinon from 'sinon'
import * as assert from 'assert'
import { EcrTagNode } from '../../../ecr/explorer/ecrTagNode'
import { FakeCommands } from '../../shared/vscode/fakeCommands'
import { FakeWindow } from '../../shared/vscode/fakeWindow'
import { EcrRepositoryNode } from '../../../ecr/explorer/ecrRepositoryNode'
import { EcrClient, EcrRepository } from '../../../shared/clients/ecrClient'
import { MockEcrClient } from '../../shared/clients/mockClients'
import { deleteTag } from '../../../ecr/commands/deleteTag'

describe('deleteTag', () => {
    const repositoryName = 'reponame'
    const tagName = 'tag'
    const parentNode = {} as EcrRepositoryNode
    const ecr: EcrClient = new MockEcrClient({})
    let node: EcrTagNode
    let sandbox: sinon.SinonSandbox

    beforeEach(() => {
        sandbox = sinon.createSandbox()
        node = new EcrTagNode(parentNode, ecr, { repositoryName: repositoryName } as EcrRepository, tagName)
    })

    afterEach(() => {
        sandbox.restore()
    })

    it('confirms deletion, deletes file, shows status bar confirmation, and refreshes parent node', async () => {
        const window = new FakeWindow({ message: { warningSelection: 'Delete' } })
        const commands = new FakeCommands()
        const stub = sandbox.stub(ecr, 'deleteTag').callsFake(async (name, tag) => {
            assert.strictEqual(name, repositoryName)
            assert.strictEqual(tag, tagName)
        })

        await deleteTag(node, window, commands)

        assert.strictEqual(window.message.warning, 'Are you sure you want to delete tag tag from repository reponame')

        assert.strictEqual(stub.calledOnce, true)

        assert.ok(window.message.information?.startsWith(`Deleted tag ${tagName} from repository ${repositoryName}`))

        assert.strictEqual(commands.command, 'aws.refreshAwsExplorerNode')
        assert.deepStrictEqual(commands.args, [parentNode])
    })

    it('does nothing when deletion is cancelled', async () => {
        const window = new FakeWindow({ message: { warningSelection: 'Cancel' } })
        const commands = new FakeCommands()
        const spy = sandbox.spy(ecr, 'deleteTag')

        await deleteTag(node, window, commands)

        assert.strictEqual(spy.notCalled, true)

        assert.strictEqual(window.statusBar.message, undefined)
        assert.strictEqual(window.message.error, undefined)
        assert.strictEqual(commands.command, undefined)
    })

    it('shows an error message and refreshes node when file deletion fails', async () => {
        sandbox.stub(ecr, 'deleteTag').callsFake(async () => {
            throw new Error('network broke')
        })

        const window = new FakeWindow({ message: { warningSelection: 'Delete' } })
        const commands = new FakeCommands()

        await deleteTag(node, window, commands)

        assert.ok(window.message.error?.startsWith(`Failed to delete tag ${tagName}`))

        assert.strictEqual(commands.command, 'aws.refreshAwsExplorerNode')
        assert.deepStrictEqual(commands.args, [parentNode])
    })
})
