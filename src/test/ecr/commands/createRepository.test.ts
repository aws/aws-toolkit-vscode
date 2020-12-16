/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as sinon from 'sinon'
import * as assert from 'assert'
import { FakeWindow } from '../../shared/vscode/fakeWindow'
import { EcrNode } from '../../../ecr/explorer/ecrNode'
import { EcrClient } from '../../../shared/clients/ecrClient'
import { createRepository } from '../../../ecr/commands/createRepository'
import { MockEcrClient } from '../../shared/clients/mockClients'
import { FakeCommands } from '../../shared/vscode/fakeCommands'

describe('createRepositoryCommand', () => {
    const ecr: EcrClient = new MockEcrClient({})
    let node: EcrNode
    let sandbox: sinon.SinonSandbox

    beforeEach(() => {
        sandbox = sinon.createSandbox()
        node = new EcrNode(ecr)
    })

    afterEach(() => {
        sandbox.restore()
    })

    it('prompts for repo name, creates repo, shows success, and refreshes node', async () => {
        const repoName = 'amazingecrrepo'

        const stub = sandbox.stub(ecr, 'createRepository').callsFake(async name => {
            assert.strictEqual(name, repoName)
        })

        const window = new FakeWindow({ inputBox: { input: repoName } })
        const commands = new FakeCommands()
        await createRepository(node, window, commands)

        assert.strictEqual(window.inputBox.options?.prompt, 'Enter a new repository name')
        assert.strictEqual(window.inputBox.options?.placeHolder, 'Repository Name')

        assert.strictEqual(window.message.information, `Created repository ${repoName}`)
        assert.ok(stub.calledOnce)

        assert.strictEqual(commands.command, 'aws.refreshAwsExplorerNode')
        assert.deepStrictEqual(commands.args, [node])
    })

    it('does nothing when prompt is cancelled', async () => {
        const spy = sandbox.spy(ecr, 'createRepository')

        await createRepository(node, new FakeWindow(), new FakeCommands())

        assert.ok(spy.notCalled)
    })

    it('Shows an error message and refreshes node when repository creation fails', async () => {
        sandbox.stub(ecr, 'createRepository').callsFake(async () => {
            throw Error('Network busted')
        })

        const window = new FakeWindow({ inputBox: { input: 'input' } })
        const commands = new FakeCommands()
        await createRepository(node, window, commands)

        assert.ok(window.message.error?.includes('Failed to create repository'))

        assert.strictEqual(commands.command, 'aws.refreshAwsExplorerNode')
        assert.deepStrictEqual(commands.args, [node])
    })

    it('Warns when repository name is invalid', async () => {
        const window = new FakeWindow({ inputBox: { input: '404' } })

        await createRepository(node, window, new FakeCommands())

        assert.strictEqual(window.inputBox.errorMessage, 'Repository name must start with a lowercase letter')
    })
})
