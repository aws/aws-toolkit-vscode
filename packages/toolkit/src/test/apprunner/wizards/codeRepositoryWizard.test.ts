/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { AppRunner } from 'aws-sdk'
import { createWizardTester, WizardTester } from '../../shared/wizards/wizardTestUtils'
import {
    AppRunnerCodeRepositoryWizard,
    createConnectionPrompter,
} from '../../../apprunner/wizards/codeRepositoryWizard'
import { DefaultAppRunnerClient } from '../../../shared/clients/apprunnerClient'
import { ConnectionSummary } from 'aws-sdk/clients/apprunner'
import { WIZARD_EXIT } from '../../../shared/wizards/wizard'
import { apprunnerConnectionHelpUrl } from '../../../shared/constants'
import { createQuickPickPrompterTester, QuickPickPrompterTester } from '../../shared/ui/testUtils'
import { stub } from '../../utilities/stubber'
import { getOpenExternalStub } from '../../globalSetup.test'

describe('AppRunnerCodeRepositoryWizard', function () {
    let tester: WizardTester<AppRunner.SourceConfiguration>
    let repoTester: WizardTester<AppRunner.CodeRepository>

    beforeEach(async function () {
        // apprunner client and git api will never be called
        const wizard = new AppRunnerCodeRepositoryWizard({} as any, {} as any)
        tester = await createWizardTester(wizard)
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

describe('createConnectionPrompter', function () {
    const defaultConnections = [
        makeConnection('connection-name-1', 'connection-arn-1'),
        makeConnection('connection-name-2', 'connection-arn-2'),
    ]

    function makeTester(connections = defaultConnections): QuickPickPrompterTester<ConnectionSummary> {
        const client = stub(DefaultAppRunnerClient, { regionCode: '' })
        client.listConnections.resolves({ ConnectionSummaryList: connections })

        return createQuickPickPrompterTester(createConnectionPrompter(client))
    }

    function makeConnection(name: string, arn: string, status: ConnectionStatus = 'AVAILABLE'): ConnectionSummary {
        return {
            ConnectionName: name,
            ConnectionArn: arn,
            Status: status,
        }
    }

    it('lists connections', async function () {
        const tester = makeTester()
        tester.assertItems(['connection-name-1', 'connection-name-2'])
        tester.acceptItem('connection-name-2')
        await tester.result(defaultConnections[1])
    })

    it('lists only available connections', async function () {
        const connections = [...defaultConnections]
        connections.push(makeConnection('pending', 'pending', 'PENDING_HANDSHAKE'))
        connections.push(makeConnection('error', 'error', 'ERROR'))
        connections.unshift(makeConnection('deleted', 'deleted', 'DELETED'))

        const tester = makeTester(connections)
        tester.assertItems(['connection-name-1', 'connection-name-2'])
        tester.hide()
        await tester.result()
    })

    it('can refresh connections', async function () {
        const connections = [...defaultConnections]
        const newConnection = makeConnection('new-connection', 'new-arn')
        const tester = makeTester(connections)

        tester.addCallback(() => connections.push(newConnection))
        tester.pressButton('Refresh')
        tester.assertItems(['connection-name-1', 'connection-name-2', 'new-connection'])
        tester.acceptItem('new-connection')
        await tester.result(newConnection)
    })

    it('shows an option to go to documentation when no connections are available', async function () {
        getOpenExternalStub().resolves(true)
        const tester = makeTester([])
        tester.assertItems(['No connections found'])
        tester.acceptItem('No connections found')
        tester.hide()
        await tester.result(WIZARD_EXIT)
        assert.strictEqual(getOpenExternalStub().firstCall.args[0].toString(), apprunnerConnectionHelpUrl)
    })
})
