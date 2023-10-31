/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as sinon from 'sinon'
import assert from 'assert'
import { EcrNode } from '../../../ecr/explorer/ecrNode'
import { DefaultEcrClient } from '../../../shared/clients/ecrClient'
import { createRepository } from '../../../ecr/commands/createRepository'
import { getTestWindow } from '../../shared/vscode/window'

describe('createRepositoryCommand', function () {
    const ecr = new DefaultEcrClient('')
    let node: EcrNode
    let sandbox: sinon.SinonSandbox
    let spyExecuteCommand: sinon.SinonSpy

    beforeEach(function () {
        sandbox = sinon.createSandbox()
        spyExecuteCommand = sandbox.spy(vscode.commands, 'executeCommand')
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
        await createRepository(node)

        assert.ok(stub.calledOnce)
        getTestWindow().getFirstMessage().assertInfo(`Created repository: ${repoName}`)
        assert(spyExecuteCommand.calledWith('aws.refreshAwsExplorerNode', node))
    })

    it('does nothing when prompt is cancelled', async function () {
        getTestWindow().onDidShowInputBox(input => input.hide())
        const spy = sandbox.spy(ecr, 'createRepository')

        await createRepository(node)

        assert.ok(spy.notCalled)
    })

    it('Shows an error message and refreshes node when repository creation fails', async function () {
        sandbox.stub(ecr, 'createRepository').callsFake(async () => {
            throw Error('Network busted')
        })

        getTestWindow().onDidShowInputBox(input => input.acceptValue('input'))
        await createRepository(node)

        getTestWindow()
            .getFirstMessage()
            .assertError(/Failed to create repository/)

        assert(spyExecuteCommand.calledWith('aws.refreshAwsExplorerNode', node))
    })

    it('Warns when repository name is invalid', async function () {
        getTestWindow().onDidShowInputBox(input => {
            input.acceptValue('404')
            assert.strictEqual(input.validationMessage, 'Repository name must start with a lowercase letter')
            input.hide()
        })

        await createRepository(node)
    })
})
