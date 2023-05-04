/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as sinon from 'sinon'
import * as assert from 'assert'
import { EcrNode } from '../../../ecr/explorer/ecrNode'
import { DefaultEcrClient } from '../../../shared/clients/ecrClient'
import { createRepository } from '../../../ecr/commands/createRepository'
import { FakeCommands } from '../../shared/vscode/fakeCommands'
import { getTestWindow } from '../../shared/vscode/window'

describe('createRepositoryCommand', function () {
    const ecr = new DefaultEcrClient('')
    let node: EcrNode
    let sandbox: sinon.SinonSandbox

    beforeEach(function () {
        sandbox = sinon.createSandbox()
        node = new EcrNode(ecr)
    })

    afterEach(function () {
        sandbox.restore()
    })

    it('prompts for repo name, creates repo, shows success, and refreshes node', async function () {
        const repoName = 'amazingecrrepo'

        const stub = sandbox.stub(ecr, 'createRepository').callsFake(async name => {
            assert.strictEqual(name, repoName)

            return {} as any
        })

        getTestWindow().onDidShowInputBox(input => {
            assert.strictEqual(input.prompt, 'Enter a new repository name')
            assert.strictEqual(input.placeholder, 'Repository Name')
            input.acceptValue(repoName)
        })
        const commands = new FakeCommands()
        await createRepository(node, commands)

        assert.ok(stub.calledOnce)
        getTestWindow().getFirstMessage().assertInfo(`Created repository: ${repoName}`)
        assert.strictEqual(commands.command, 'aws.refreshAwsExplorerNode')
        assert.deepStrictEqual(commands.args, [node])
    })

    it('does nothing when prompt is cancelled', async function () {
        getTestWindow().onDidShowInputBox(input => input.hide())
        const spy = sandbox.spy(ecr, 'createRepository')

        await createRepository(node, new FakeCommands())

        assert.ok(spy.notCalled)
    })

    it('Shows an error message and refreshes node when repository creation fails', async function () {
        sandbox.stub(ecr, 'createRepository').callsFake(async () => {
            throw Error('Network busted')
        })

        getTestWindow().onDidShowInputBox(input => input.acceptValue('input'))
        const commands = new FakeCommands()
        await createRepository(node, commands)

        getTestWindow()
            .getFirstMessage()
            .assertError(/Failed to create repository/)

        assert.strictEqual(commands.command, 'aws.refreshAwsExplorerNode')
        assert.deepStrictEqual(commands.args, [node])
    })

    it('Warns when repository name is invalid', async function () {
        getTestWindow().onDidShowInputBox(input => {
            input.acceptValue('404')
            assert.strictEqual(input.validationMessage, 'Repository name must start with a lowercase letter')
            input.hide()
        })

        await createRepository(node, new FakeCommands())
    })
})
