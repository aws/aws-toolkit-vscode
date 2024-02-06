/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as vscode from 'vscode'
import { DefaultEcsClient } from '../../shared/clients/ecsClient'
import { TestSettings } from '../utilities/testSettingsConfiguration'
import { PromptSettings } from '../../shared/settings'
import { Service } from '../../ecs/model'
import { stub } from '../utilities/stubber'
import { EcsRunCommandPrompt, toggleExecuteCommandFlag } from '../../ecs/commands'

describe('toggleExecuteCommandFlag', async function () {
    const settings = new PromptSettings(new TestSettings())

    before(async function () {
        await settings.disablePrompt(EcsRunCommandPrompt.Enable)
        await settings.disablePrompt(EcsRunCommandPrompt.Disable)
    })

    it('attempts to enable service', async function () {
        const client = stub(DefaultEcsClient, { regionCode: '' })
        client.updateService.callsFake(async request => assert.strictEqual(request.enableExecuteCommand, true))
        const service = new Service(client, {})
        const didChange = new Promise<boolean>(resolve => {
            service.onDidChangeTreeItem(() => resolve(true))
            setTimeout(() => resolve(false), 1000)
        })

        await toggleExecuteCommandFlag(service, vscode.window, settings)
        assert.ok(client.updateService.calledOnce)
        assert.ok(await didChange)
    })

    it('attempts to disable service', async function () {
        const client = stub(DefaultEcsClient, { regionCode: '' })
        client.updateService.callsFake(async request => assert.strictEqual(request.enableExecuteCommand, false))
        const service = new Service(client, { enableExecuteCommand: true })
        const didChange = new Promise<boolean>(resolve => {
            service.onDidChangeTreeItem(() => resolve(true))
            setTimeout(() => resolve(false), 1000)
        })

        await toggleExecuteCommandFlag(service, vscode.window, settings)
        assert.ok(client.updateService.calledOnce)
        assert.ok(await didChange)
    })
})

describe('openTaskInTerminal', async function () {
    const settings = new PromptSettings(new TestSettings())

    before(async function () {
        await settings.disablePrompt(EcsRunCommandPrompt.Enable)
        await settings.disablePrompt(EcsRunCommandPrompt.Disable)
    })

    it('attempts to enable service', async function () {
        const client = stub(DefaultEcsClient, { regionCode: '' })
        client.updateService.callsFake(async request => assert.strictEqual(request.enableExecuteCommand, true))
        const service = new Service(client, {})
        const didChange = new Promise<boolean>(resolve => {
            service.onDidChangeTreeItem(() => resolve(true))
            setTimeout(() => resolve(false), 1000)
        })

        await toggleExecuteCommandFlag(service, vscode.window, settings)
        assert.ok(client.updateService.calledOnce)
        assert.ok(await didChange)
    })

    it('attempts to disable service', async function () {
        const client = stub(DefaultEcsClient, { regionCode: '' })
        client.updateService.callsFake(async request => assert.strictEqual(request.enableExecuteCommand, false))
        const service = new Service(client, { enableExecuteCommand: true })
        const didChange = new Promise<boolean>(resolve => {
            service.onDidChangeTreeItem(() => resolve(true))
            setTimeout(() => resolve(false), 1000)
        })

        await toggleExecuteCommandFlag(service, vscode.window, settings)
        assert.ok(client.updateService.calledOnce)
        assert.ok(await didChange)
    })
})
