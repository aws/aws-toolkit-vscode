/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as sinon from 'sinon'
import * as assert from 'assert'
import { EcrTagNode } from '../../../ecr/explorer/ecrTagNode'
import { FakeCommands } from '../../shared/vscode/fakeCommands'
import { EcrRepositoryNode } from '../../../ecr/explorer/ecrRepositoryNode'
import { DefaultEcrClient, EcrRepository } from '../../../shared/clients/ecrClient'
import { deleteTag } from '../../../ecr/commands/deleteTag'
import { assertNoErrorMessages, getTestWindow } from '../../shared/vscode/window'

describe('deleteTag', function () {
    const repositoryName = 'reponame'
    const tagName = 'tag'
    const parentNode = {} as EcrRepositoryNode
    const ecr = new DefaultEcrClient('')
    let node: EcrTagNode
    let sandbox: sinon.SinonSandbox

    beforeEach(function () {
        sandbox = sinon.createSandbox()
        node = new EcrTagNode(parentNode, ecr, { repositoryName: repositoryName } as EcrRepository, tagName)
    })

    afterEach(function () {
        sandbox.restore()
    })

    it('confirms deletion, deletes file, shows status bar confirmation, and refreshes parent node', async function () {
        getTestWindow().onDidShowMessage(m => m.items.find(i => i.title === 'Delete')?.select())
        const commands = new FakeCommands()
        const stub = sandbox.stub(ecr, 'deleteTag').callsFake(async (name, tag) => {
            assert.strictEqual(name, repositoryName)
            assert.strictEqual(tag, tagName)
        })

        await deleteTag(node, commands)

        getTestWindow().getFirstMessage().assertWarn('Are you sure you want to delete tag tag from repository reponame')

        assert.strictEqual(stub.calledOnce, true)

        getTestWindow().getSecondMessage().assertInfo(`Deleted tag ${tagName} from repository ${repositoryName}`)

        assert.strictEqual(commands.command, 'aws.refreshAwsExplorerNode')
        assert.deepStrictEqual(commands.args, [parentNode])
    })

    it('does nothing when deletion is cancelled', async function () {
        getTestWindow().onDidShowMessage(m => m.selectItem('Cancel'))
        const commands = new FakeCommands()
        const spy = sandbox.spy(ecr, 'deleteTag')

        await deleteTag(node, commands)

        assert.strictEqual(spy.notCalled, true)

        assert.deepStrictEqual(getTestWindow().statusBar.messages, [])
        assertNoErrorMessages()
        assert.strictEqual(commands.command, undefined)
    })

    it('shows an error message and refreshes node when file deletion fails', async function () {
        sandbox.stub(ecr, 'deleteTag').callsFake(async () => {
            throw new Error('network broke')
        })

        getTestWindow().onDidShowMessage(m => m.items.find(i => i.title === 'Delete')?.select())
        const commands = new FakeCommands()

        await deleteTag(node, commands)

        getTestWindow()
            .getSecondMessage()
            .assertError(new RegExp(`^Failed to delete tag ${tagName}`))

        assert.strictEqual(commands.command, 'aws.refreshAwsExplorerNode')
        assert.deepStrictEqual(commands.args, [parentNode])
    })
})
