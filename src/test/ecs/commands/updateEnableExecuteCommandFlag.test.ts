/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as sinon from 'sinon'
import * as assert from 'assert'
import { EcsServiceNode } from '../../../ecs/explorer/ecsServiceNode'
import { EcsClient, DefaultEcsClient } from '../../../shared/clients/ecsClient'
import { ECS } from 'aws-sdk'
import { EcsClusterNode } from '../../../ecs/explorer/ecsClusterNode'
import {
    EcsRunCommandPrompt,
    updateEnableExecuteCommandFlag,
} from '../../../ecs/commands/updateEnableExecuteCommandFlag'
import { Commands } from '../../../shared/vscode/commands'
import { Window } from '../../../shared/vscode/window'
import { TestSettings } from '../../utilities/testSettingsConfiguration'
import { PromptSettings } from '../../../shared/settings'

describe('updateEnableExecuteCommandFlag', async function () {
    let sandbox: sinon.SinonSandbox
    let node: EcsServiceNode
    const serviceName = 'serviceName'
    const serviceExecEnabled: ECS.Service = { clusterArn: 'clusterArn', serviceName, enableExecuteCommand: true }
    const serviceExecDisabled: ECS.Service = { clusterArn: 'clusterArn', serviceName, enableExecuteCommand: false }
    const parent = { clearChildren: () => {} } as EcsClusterNode
    const ecs: EcsClient = new DefaultEcsClient('fakeRegion')
    const commands = Commands.vscode()
    const settings = new PromptSettings(new TestSettings())

    before(async function () {
        await settings.disablePrompt(EcsRunCommandPrompt.Enable)
        await settings.disablePrompt(EcsRunCommandPrompt.Disable)
    })

    beforeEach(function () {
        sandbox = sinon.createSandbox()
    })

    afterEach(function () {
        sandbox.restore()
    })

    it('attempts to enable service', async function () {
        node = new EcsServiceNode(serviceExecDisabled, parent, ecs)
        const updateStub = sandbox.stub(ecs, 'updateService').resolves()
        const parentStub = sandbox.stub(parent, 'clearChildren').resolves()
        sandbox.stub(commands, 'execute').resolves()

        await updateEnableExecuteCommandFlag(node, true, Window.vscode(), Commands.vscode(), settings)

        assert.strictEqual(
            updateStub.calledOnceWith('clusterArn', serviceName, true),
            true,
            'Expected attempt to enable service'
        )
        assert.strictEqual(parentStub.calledOnce, true, 'Expected parent to clear children before refresh')
    })

    it('attempts to disable service', async function () {
        node = new EcsServiceNode(serviceExecEnabled, parent, ecs)
        const updateStub = sandbox.stub(ecs, 'updateService').resolves()
        const parentStub = sandbox.stub(parent, 'clearChildren').resolves()
        sandbox.stub(commands, 'execute').resolves()

        await updateEnableExecuteCommandFlag(node, false, Window.vscode(), Commands.vscode(), settings)

        assert.strictEqual(
            updateStub.calledOnceWith('clusterArn', serviceName, false),
            true,
            'Expected attempt to disable service'
        )
        assert.strictEqual(parentStub.calledOnce, true, 'Expected parent to clear children before refresh')
    })

    it('will not enable if enabled', async function () {
        node = new EcsServiceNode(serviceExecEnabled, parent, ecs)
        const updateStub = sandbox.stub(ecs, 'updateService').resolves()
        const parentStub = sandbox.stub(parent, 'clearChildren').resolves()

        await updateEnableExecuteCommandFlag(node, true, Window.vscode(), Commands.vscode(), settings)

        assert.strictEqual(updateStub.callCount, 0, 'Expected to return without updating service')
        assert.strictEqual(parentStub.callCount, 0)
    })

    it('will not disable if disabled', async function () {
        node = new EcsServiceNode(serviceExecDisabled, parent, ecs)
        const updateStub = sandbox.stub(ecs, 'updateService').resolves()
        const parentStub = sandbox.stub(parent, 'clearChildren').resolves()

        await updateEnableExecuteCommandFlag(node, false, Window.vscode(), Commands.vscode(), settings)

        assert.strictEqual(updateStub.callCount, 0, 'Expected to return without updating service')
        assert.strictEqual(parentStub.callCount, 0)
    })
})
