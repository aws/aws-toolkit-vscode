/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as sinon from 'sinon'
import * as assert from 'assert'
import { AppRunner } from 'aws-sdk'
import { createWizardTester, WizardTester } from '../../shared/wizards/wizardTestUtils'
import {
    AppRunnerCodeRepositoryWizard,
    createConnectionPrompter,
} from '../../../apprunner/wizards/codeRepositoryWizard'
import { AppRunnerClient } from '../../../shared/clients/apprunnerClient'
import { ConnectionSummary } from 'aws-sdk/clients/apprunner'
import { apprunnerConnectionHelpUrl } from '../../../shared/constants'
import { createQuickPickTester, QuickPickTester } from '../../shared/ui/testUtils'
import { WizardControl } from '../../../shared/wizards/util'

describe('AppRunnerCodeRepositoryWizard', function () {
    let tester: WizardTester<AppRunner.SourceConfiguration>
    let repoTester: Omit<WizardTester<AppRunner.CodeRepository>, 'printInfo' | 'runTester'>

    beforeEach(function () {
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
        codevalues.Runtime.assertShow()
        codevalues.Runtime.applyInput('')
        codevalues.BuildCommand.assertShow()
        codevalues.StartCommand.assertShow()
        codevalues.RuntimeEnvironmentVariables.assertShow()
        codevalues.Port.assertShow()
    })

    it('sets "AutoDeploymentsEnabled" to false by default', function () {
        tester.AutoDeploymentsEnabled.assertValue(false)
    })
})

type ConnectionStatus = 'AVAILABLE' | 'PENDING_HANDSHAKE' | 'ERROR' | 'DELETED'

describe('createConnectionPrompter', function () {
    let connections: ConnectionSummary[]
    let sandbox: sinon.SinonSandbox
    let tester: QuickPickTester<ConnectionSummary>
    let openExternal: sinon.SinonSpy<Parameters<typeof vscode.env.openExternal>>

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
    })

    beforeEach(function () {
        connections = [
            makeConnection('connection-name-1', 'connection-arn-1'),
            makeConnection('connection-name-2', 'connection-arn-2'),
        ]
        tester = createQuickPickTester(createConnectionPrompter(fakeApprunnerClient))
        openExternal = sandbox.stub(vscode.env, 'openExternal')
    })

    afterEach(function () {
        sandbox.restore()
    })

    it('lists connections', async function () {
        tester.assertItems(['connection-name-1', 'connection-name-2'])
        tester.acceptItem('connection-name-2')
        await tester.result(connections[1])
    })

    it('sorts pending connections last', async function () {
        connections.unshift(makeConnection('pending', 'pending', 'PENDING_HANDSHAKE'))

        tester.assertItems(['connection-name-1', 'connection-name-2', 'pending'])
        tester.hide()
        await tester.result()
    })

    it('lists only available or pending connections', async function () {
        connections.push(makeConnection('pending', 'pending', 'PENDING_HANDSHAKE'))
        connections.push(makeConnection('error', 'error', 'ERROR'))
        connections.unshift(makeConnection('deleted', 'deleted', 'DELETED'))

        tester = createQuickPickTester(createConnectionPrompter(fakeApprunnerClient))
        tester.assertItems(['connection-name-1', 'connection-name-2', 'pending'])
        tester.addCallback(prompter => assert.strictEqual(prompter?.quickPick.items[2].detail, 'Pending handshake'))
        tester.hide()
        await tester.result()
    })

    it('does not accept pending connections', async function () {
        connections.push(makeConnection('pending', 'pending', 'PENDING_HANDSHAKE'))

        tester = createQuickPickTester(createConnectionPrompter(fakeApprunnerClient))
        tester.acceptItem('pending')
        tester.acceptItem('connection-name-1')
        await tester.result(connections[0])
    })

    it('can refresh connections', async function () {
        const newConnection = makeConnection('new-connection', 'new-arn')
        tester.addCallback(() => connections.push(newConnection))
        tester.pressButton('Refresh')
        tester.assertItems(['connection-name-1', 'connection-name-2', 'new-connection'])
        tester.acceptItem('new-connection')
        await tester.result(newConnection)
    })

    it('shows an option to go to documentation when no connections are available', async function () {
        connections = []
        tester = createQuickPickTester(createConnectionPrompter(fakeApprunnerClient))
        tester.assertItems(['No connections found'])
        tester.acceptItem('No connections found')
        tester.hide()
        await tester.result(WizardControl.Exit)
        assert.strictEqual(openExternal.firstCall.args[0].toString(), apprunnerConnectionHelpUrl)
    })
})
