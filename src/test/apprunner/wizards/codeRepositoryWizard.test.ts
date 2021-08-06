/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as sinon from 'sinon'
import * as picker from '../../../shared/ui/pickerPrompter'
import * as assert from 'assert'
import { AppRunner } from 'aws-sdk'
import { createWizardTester, WizardTester } from '../../shared/wizards/wizardTestUtils'
import { AppRunnerCodeRepositoryWizard, ConnectionPrompter } from '../../../apprunner/wizards/codeRepositoryWizard'
import { AppRunnerClient } from '../../../shared/clients/apprunnerClient'
import { ConnectionSummary } from 'aws-sdk/clients/apprunner'
import { Prompter } from '../../../shared/ui/prompter'
import { WIZARD_EXIT } from '../../../shared/wizards/wizard'
import { exposeEmitters, ExposeEmitters } from '../../shared/vscode/testUtils'
import { APPRUNNER_CONNECTION_HELP_URL } from '../../../shared/constants'

describe('AppRunnerCodeRepositoryWizard', function () {
    let tester: WizardTester<AppRunner.SourceConfiguration>
    let repoTester: WizardTester<AppRunner.CodeRepository>

    beforeEach(function () {
        // apprunner client and git api will never be called
        const wizard = new AppRunnerCodeRepositoryWizard({} as any, {} as any)
        tester = createWizardTester(wizard)
        repoTester = tester.CodeRepository
    })

    it('prompts for GitHub connection first', function () {
        tester.AuthenticationConfiguration.ConnectionArn.assertShowFirst()
    })

    it('prompts for repository URL and branch', function () {
        repoTester.RepositoryUrl.assertShow()
        repoTester.SourceCodeVersion.Value.assertShow()
        repoTester.SourceCodeVersion.Type.assertValue('BRANCH')
    })

    it('does not prompt for code configuration if "API" is not set', function () {
        repoTester.CodeConfiguration.ConfigurationSource.applyInput('REPOSITORY')
        repoTester.CodeConfiguration.CodeConfigurationValues.assertDoesNotShowAny()
    })

    it('adds all steps under CodeConfigurationValues if "API" is set', function () {
        const codeconfig = repoTester.CodeConfiguration
        const codevalues = codeconfig.CodeConfigurationValues

        codevalues.assertDoesNotShowAny()
        codeconfig.ConfigurationSource.applyInput('API')
        codevalues.BuildCommand.assertShow()
        codevalues.Runtime.assertShow()
        codevalues.RuntimeEnvironmentVariables.assertShow()
        codevalues.StartCommand.assertShow()
        codevalues.Port.assertShow()
    })

    it('sets "AutoDeploymentsEnabled" to false by default', function () {
        tester.AutoDeploymentsEnabled.assertValue(false)
    })
})

type ConnectionStatus = 'AVAILABLE' | 'PENDING_HANDSHAKE' | 'ERROR' | 'DELETED'

describe('ConnectionPrompter', function () {
    let connections: ConnectionSummary[]
    let prompterProvider: ConnectionPrompter
    let sandbox: sinon.SinonSandbox
    let fakePicker: ExposeEmitters<vscode.QuickPick<picker.DataQuickPickItem<string>>, 'onDidTriggerButton'>
    let prompter: Prompter<ConnectionSummary>
    let itemsPromise: Promise<void>
    let openExternal: sinon.SinonSpy<Parameters<typeof vscode.env.openExternal>>

    const fakeState = {
        stepCache: {},
        estimator: () => 0,
    }

    const fakeApprunnerClient: AppRunnerClient = {
        listConnections: (request: any) =>
            Promise.resolve({
                ConnectionSummaryList: connections,
            }),
    } as any

    function makeConnection(name: string, arn: string, status: ConnectionStatus = 'AVAILABLE'): ConnectionSummary {
        return {
            ConnectionName: name,
            ConnectionArn: arn,
            Status: status,
        }
    }

    before(function () {
        sandbox = sinon.createSandbox()
        openExternal = sinon.stub(vscode.env, 'openExternal')
        sinon.stub(picker, 'createQuickPick').callsFake((items, options) => {
            fakePicker = exposeEmitters(vscode.window.createQuickPick(), ['onDidTriggerButton'])
            fakePicker.buttons = options?.buttons ?? [] // TODO: use 'applyPrimitives'
            const prompter = new picker.QuickPickPrompter(fakePicker as any)
            itemsPromise = prompter.loadItems(items)

            return prompter
        })
    })

    beforeEach(function () {
        connections = [
            makeConnection('connection-name-1', 'connection-arn-1'),
            makeConnection('connection-name-2', 'connection-arn-2'),
        ]
        fakeState.stepCache = {}
        prompterProvider = new ConnectionPrompter(fakeApprunnerClient)
    })

    afterEach(function () {
        sandbox.restore()
        openExternal.resetHistory()
    })

    after(function () {
        sinon.restore()
    })

    function onShow(picker: typeof fakePicker): Promise<void> {
        return new Promise(resolve => {
            picker.onDidChangeActive(actives => {
                if (actives.length > 0) {
                    resolve()
                }
            })
        })
    }

    it('lists connections', async function () {
        prompter = prompterProvider(fakeState)
        await itemsPromise
        fakePicker.items.forEach((item, index) => {
            assert.strictEqual(item.data, connections[index])
        })
    })

    it('can accept a connection', async function () {
        prompter = prompterProvider(fakeState)
        await itemsPromise
        const result = prompter.prompt()
        await onShow(fakePicker)
        fakePicker.selectedItems = fakePicker.activeItems
        assert.strictEqual(await result, connections[0])
    })

    it('lists only available connections', async function () {
        const original = [...connections]
        connections.push(makeConnection('pending', 'pending', 'PENDING_HANDSHAKE'))
        connections.push(makeConnection('error', 'error', 'ERROR'))
        connections.unshift(makeConnection('deleted', 'deleted', 'DELETED'))

        prompter = prompterProvider(fakeState)
        await itemsPromise
        fakePicker.items.forEach((item, index) => {
            assert.strictEqual(item.data, original[index])
        })
    })

    it('can refresh connections', async function () {
        prompter = prompterProvider(fakeState)
        await itemsPromise
        const result = prompter.prompt()
        await onShow(fakePicker)
        connections.push(makeConnection('new-connection', 'new-arn'))
        fakePicker.onDidChangeActive(() => {
            if (fakePicker.items.length > 2) {
                fakePicker.selectedItems = [fakePicker.items[2]]
            }
        })
        fakePicker.fireOnDidTriggerButton(fakePicker.buttons.filter(b => b.tooltip === 'Refresh')[0])
        assert.strictEqual(await result, connections[2])
    })

    it('shows an option to create a new connection when no connections are available', async function () {
        connections = []

        prompter = prompterProvider(fakeState)
        await itemsPromise
        assert.strictEqual(fakePicker.items.length, 1)
        assert.strictEqual(fakePicker.items[0].invalidSelection, true)
        assert.strictEqual(fakePicker.items[0].label, 'No connections found')
        const result = prompter.prompt()
        await onShow(fakePicker)

        fakePicker.selectedItems = fakePicker.activeItems
        fakePicker.hide()
        assert.strictEqual(await result, WIZARD_EXIT)
        assert.strictEqual(openExternal.firstCall.args[0].toString(), APPRUNNER_CONNECTION_HELP_URL)
    })
})
