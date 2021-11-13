/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as assert from 'assert'
import * as picker from '../../../shared/ui/picker'
import * as sinon from 'sinon'
import * as cliUtils from '../../../shared/utilities/cliUtils'
import { runCommandInContainer } from '../../../ecs/commands/runCommandInContainer'
import { EcsContainerNode } from '../../../ecs/explorer/ecsContainerNode'
import { DefaultEcsClient, EcsClient } from '../../../shared/clients/ecsClient'
import { ChildProcess } from '../../../shared/utilities/childProcess'
import { FakeWindow } from '../../shared/vscode/fakeWindow'
import { FakeChildProcessResult } from '../../shared/sam/cli/testSamCliProcessInvoker'
import { MockOutputChannel } from '../../mockOutputChannel'
import { TestSettingsConfiguration } from '../../utilities/testSettingsConfiguration'
import { ECS } from 'aws-sdk'

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
    const settings = new TestSettingsConfiguration()

    const successfulCPResult: FakeChildProcessResult = new FakeChildProcessResult({})

    const ecs: EcsClient = new DefaultEcsClient('fakeRegion')
    let node: EcsContainerNode

    beforeEach(function () {
        sandbox = sinon.createSandbox()
        node = new EcsContainerNode(containerName, serviceName, clusterArn, ecs)
        settings.disablePrompt('ecsRunCommand')
    })

    afterEach(function () {
        sandbox.restore()
    })

    it('prompts for command', async function () {
        const childCalls = sandbox.stub(ChildProcess.prototype, 'run').resolves(successfulCPResult)
        sandbox.stub(ecs, 'describeServices').resolves(serviceNoDeployments)
        sandbox.stub(ecs, 'listTasks').resolves(taskListTwo)
        sandbox.stub(ecs, 'describeTasks').resolves(describedTasksOne)
        sandbox.stub(picker, 'promptUser').resolves(chosenTask)
        sandbox.stub(cliUtils, 'getOrInstallCli').resolves('session-manager-plugin')
        sandbox.stub(ecs, 'executeCommand').resolves({} as ECS.ExecuteCommandRequest)

        const window = new FakeWindow({ inputBox: { input: 'ls' } })
        await runCommandInContainer(node, window, outputChannel, settings)

        assert.strictEqual(childCalls.callCount, 1)
        assert.strictEqual(window.inputBox.options?.prompt, 'Enter the command to run in container: containerName')
    })

    it('does not show picker if only one task exists', async function () {
        const childCalls = sandbox.stub(ChildProcess.prototype, 'run').resolves(successfulCPResult)
        sandbox.stub(ecs, 'describeServices').resolves(serviceNoDeployments)
        sandbox.stub(ecs, 'listTasks').resolves(taskListOne)
        sandbox.stub(ecs, 'describeTasks').resolves(describedTasksOne)
        sandbox.stub(cliUtils, 'getOrInstallCli').resolves('session-manager-plugin')
        sandbox.stub(ecs, 'executeCommand').resolves({} as ECS.ExecuteCommandRequest)
        const pickerStub = sandbox.stub(picker, 'promptUser')

        const window = new FakeWindow({ inputBox: { input: 'ls' } })
        await runCommandInContainer(node, window, outputChannel, settings)

        assert.strictEqual(pickerStub.notCalled, true)
        assert.strictEqual(childCalls.callCount, 1)
    })
})
