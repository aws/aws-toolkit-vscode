/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as assert from 'assert'
import * as picker from '../../../shared/ui/picker'
import * as sinon from 'sinon'
import { runCommandInContainer } from '../../../ecs/commands/runCommandInContainer'
import { EcsContainerNode } from '../../../ecs/explorer/ecsContainerNode'
import { DefaultEcsClient, EcsClient } from '../../../shared/clients/ecsClient'
import { ChildProcess } from '../../../shared/utilities/childProcess'
import { FakeWindow } from '../../shared/vscode/fakeWindow'
import { FakeChildProcessResult } from '../../shared/sam/cli/testSamCliProcessInvoker'
import { DefaultSettingsConfiguration } from '../../../shared/settingsConfiguration'
import { MockOutputChannel } from '../../mockOutputChannel'

describe('runCommandInContainer', function () {
    let sandbox: sinon.SinonSandbox
    const taskListOne = ['onlyTask']
    const taskListTwo = ['taskId1', 'taskId2']
    const describedTasksOne = [
        { taskArn: 'thisstringneedstobeoverthirtytwocharacterslong', lastStatus: 'RUNNING', desiredStatus: 'RUNNING' },
    ]
    const chosenTask = [{ label: 'taskId1' }]
    const containerName = 'containerName'
    const serviceName = 'serviceName'
    const clusterArn = 'arn:fake:cluster'
    const serviceNoDeployments = [{ deployments: [{ status: 'PRIMARY', rolloutState: 'COMPLETED' }] }]
    const outputChannel = new MockOutputChannel()

    const doesNotHaveAwsCliChildProcessResult: FakeChildProcessResult = {
        stdout: '',
        error: undefined,
        exitCode: 254,
        stderr: 'This is not installed',
    }

    const doesNotHaveSSMPluginChildProcessResult: FakeChildProcessResult = {
        stdout: '',
        error: undefined,
        exitCode: 254,
        stderr: 'This is not installed',
    }

    const successfulCPResult: FakeChildProcessResult = new FakeChildProcessResult({})

    const ecs: EcsClient = new DefaultEcsClient('fakeRegion')
    let node: EcsContainerNode

    beforeEach(function () {
        sandbox = sinon.createSandbox()
        node = new EcsContainerNode(containerName, serviceName, clusterArn, ecs)
    })

    afterEach(function () {
        sandbox.restore()
    })

    it('prompts for command', async function () {
        const childCalls = sandbox.stub(ChildProcess.prototype, 'run').onFirstCall().resolves(successfulCPResult)
        childCalls.onSecondCall().resolves(successfulCPResult).onThirdCall().resolves(successfulCPResult)
        sandbox.stub(ecs, 'describeServices').resolves(serviceNoDeployments)
        sandbox.stub(ecs, 'listTasks').resolves(taskListTwo)
        sandbox.stub(ecs, 'describeTasks').resolves(describedTasksOne)
        sandbox.stub(picker, 'promptUser').resolves(chosenTask)
        sandbox.stub(DefaultSettingsConfiguration.prototype, 'readSetting').returns(false)

        const window = new FakeWindow({ inputBox: { input: 'ls' } })
        await runCommandInContainer(node, window, outputChannel)

        assert.strictEqual(childCalls.callCount, 3)
        assert.strictEqual(window.inputBox.options?.prompt, 'Enter the command to run in container: containerName')
    })

    it('does not show picker if only one task exists', async function () {
        const childCalls = sandbox.stub(ChildProcess.prototype, 'run').onFirstCall().resolves(successfulCPResult)
        childCalls.onSecondCall().resolves(successfulCPResult).onThirdCall().resolves(successfulCPResult)
        sandbox.stub(ecs, 'describeServices').resolves(serviceNoDeployments)
        sandbox.stub(ecs, 'listTasks').resolves(taskListOne)
        sandbox.stub(ecs, 'describeTasks').resolves(describedTasksOne)
        sandbox.stub(DefaultSettingsConfiguration.prototype, 'readSetting').returns(false)
        const pickerStub = sandbox.stub(picker, 'promptUser')

        const window = new FakeWindow({ inputBox: { input: 'ls' } })
        await runCommandInContainer(node, window, outputChannel)

        assert.strictEqual(pickerStub.notCalled, true)
        assert.strictEqual(childCalls.callCount, 3)
    })

    it('throws error if AWS CLI not installed', async function () {
        const childCalls = sandbox
            .stub(ChildProcess.prototype, 'run')
            .onFirstCall()
            .resolves(doesNotHaveAwsCliChildProcessResult)
        childCalls.onSecondCall().resolves(successfulCPResult)
        const listTasksStub = sandbox.stub(ecs, 'listTasks').resolves(taskListTwo)
        const pickerStub = sandbox.stub(picker, 'promptUser')

        const window = new FakeWindow({ inputBox: { input: 'ls' } })
        try {
            await runCommandInContainer(node, window, outputChannel)
        } catch (error) {
            assert.ok(error)
        }

        assert.strictEqual(childCalls.callCount, 1)
        assert.strictEqual(listTasksStub.notCalled, true)
        assert.strictEqual(pickerStub.notCalled, true)
    })

    it('throws error if SSM plugin not installed', async function () {
        const childCalls = sandbox.stub(ChildProcess.prototype, 'run').onFirstCall().resolves(successfulCPResult)
        childCalls.onSecondCall().resolves(doesNotHaveSSMPluginChildProcessResult)
        const listTasksStub = sandbox.stub(ecs, 'listTasks').resolves(taskListTwo)
        const pickerStub = sandbox.stub(picker, 'promptUser')

        const window = new FakeWindow({ inputBox: { input: 'ls' } })
        try {
            await runCommandInContainer(node, window, outputChannel)
        } catch (error) {
            assert.ok(error)
        }

        assert.strictEqual(childCalls.callCount, 2)
        assert.strictEqual(listTasksStub.notCalled, true)
        assert.strictEqual(pickerStub.notCalled, true)
    })
})
