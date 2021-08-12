/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { AppRunner } from 'aws-sdk'
import * as nls from 'vscode-nls'
import {
    createBackButton,
    createExitButton,
    createHelpButton,
    createRefreshButton,
    QuickInputToggleButton,
} from '../../shared/ui/buttons'
import { Remote } from '../../../types/git.d'
import { GitExtension } from '../../shared/extensions/git'
import * as vscode from 'vscode'
import { CachedFunction, CachedPrompter } from '../../shared/ui/prompter'
import { WizardForm } from '../../shared/wizards/wizardForm'
import { createVariablesPrompter } from '../../shared/ui/common/variablesPrompter'
import { AppRunnerClient } from '../../shared/clients/apprunnerClient'
import { makeDeploymentButton } from './deploymentButton'
import { ConnectionSummary } from 'aws-sdk/clients/apprunner'
import {
    createLabelQuickPick,
    createQuickPick,
    DataQuickPickItem,
    QuickPickPrompter,
} from '../../shared/ui/pickerPrompter'
import { createInputBox, InputBoxPrompter } from '../../shared/ui/inputPrompter'
import {
    APPRUNNER_CONNECTION_HELP_URL,
    APPRUNNER_CONFIGURATION_HELP_URL,
    APPRUNNER_RUNTIME_HELP_URL,
} from '../../shared/constants'
import { Wizard, WIZARD_BACK } from '../../shared/wizards/wizard'
import { getLogger } from '../../shared/logger/logger'

const localize = nls.loadMessageBundle()

function makeButtons(helpUri?: string | vscode.Uri) {
    return [createHelpButton(helpUri), createBackButton(), createExitButton()]
}

function validateCommand(command: string): string | undefined {
    if (command == '') {
        return localize('AWS.apprunner.command.invalid', 'Command cannot be empty')
    }

    return undefined
}

function createRepoPrompter(git: GitExtension): QuickPickPrompter<Remote> {
    const remotes = git.getRemotes()
    const userInputString = localize('AWS.apprunner.createService.customRepo', 'Enter GitHub URL')
    const items = remotes.map(remote => ({ label: remote.name, detail: remote.fetchUrl, data: remote }))
    return createQuickPick(items, {
        title: localize('AWS.apprunner.createService.selectRepository.title', 'Select a remote GitHub repository'),
        placeholder: localize(
            'AWS.apprunner.createService.selectRepository.placeholder',
            'Select a remote repository or enter a URL'
        ),
        filterBoxInputSettings: {
            label: userInputString,
            transform: resp => ({ name: 'UserRemote', isReadOnly: true, fetchUrl: resp }),
        },
        buttons: makeButtons(),
    })
}

function createBranchPrompter(
    git: GitExtension,
    cache: { [key: string]: any },
    repo: string = ''
): QuickPickPrompter<string> {
    const last = cache[repo]
    const branchItems =
        last ??
        git.getBranchesForRemote({ name: '', fetchUrl: repo } as any).then(branches => {
            const branchItems = branches
                .filter(b => b.name !== undefined && b.name !== '')
                .map(branch => ({
                    label: branch.name!.split('/').slice(1).join('/'),
                }))
            cache[repo] = branchItems
            return branchItems
        })
    const userInputString = localize('AWS.apprunner.createService.customRepo', 'Enter branch name')
    return createLabelQuickPick(branchItems, {
        title: localize('AWS.apprunner.createService.selectBranch.title', 'Select a branch'),
        filterBoxInputSettings: {
            label: userInputString,
            transform: resp => resp,
        },
        buttons: makeButtons(),
        placeholder: localize(
            'AWS.apprunner.createService.selectBranch.placeholder',
            'Select a branch or enter a branch name'
        ),
    })
}

function createRuntimePrompter(): QuickPickPrompter<AppRunner.Runtime> {
    const items = [
        { label: 'python3', data: 'PYTHON_3' },
        { label: 'nodejs12', data: 'NODEJS_12' },
    ]

    return createQuickPick(items, {
        title: localize('AWS.apprunner.createService.selectRuntime.title', 'Select a runtime'),
        buttons: makeButtons(APPRUNNER_RUNTIME_HELP_URL),
    })
}

function createBuildCommandPrompter(runtime: AppRunner.Runtime): InputBoxPrompter {
    const buildCommandMap = {
        python: 'pip install -r requirements.txt',
        node: 'npm install',
    } as { [key: string]: string }

    return createInputBox({
        title: localize('AWS.apprunner.createService.buildCommand.title', 'Enter a build command'),
        buttons: makeButtons(APPRUNNER_RUNTIME_HELP_URL),
        placeholder:
            buildCommandMap[Object.keys(buildCommandMap).filter(key => runtime.toLowerCase().includes(key))[0]],
        validateInput: validateCommand,
    })
}

function createStartCommandPrompter(runtime: AppRunner.Runtime): InputBoxPrompter {
    const startCommandMap = {
        python: 'python runapp.py',
        node: 'node app.js',
    } as { [key: string]: string }

    return createInputBox({
        title: localize('AWS.apprunner.createService.startCommand.title', 'Enter a start command'),
        buttons: makeButtons(APPRUNNER_RUNTIME_HELP_URL),
        placeholder:
            startCommandMap[Object.keys(startCommandMap).filter(key => runtime.toLowerCase().includes(key))[0]],
        validateInput: validateCommand,
    })
}

function createPortPrompter(): InputBoxPrompter {
    const validatePort = (port: string) => {
        if (isNaN(Number(port)) || port === '') {
            return localize('AWS.apprunner.createService.selectPort.invalidPort', 'Port must be a number')
        }

        return undefined
    }

    return createInputBox({
        validateInput: validatePort,
        title: localize('AWS.apprunner.createService.selectPort.title', 'Enter a port for the new service'),
        placeholder: 'Enter a port',
        buttons: makeButtons(),
    })
}

export class ConnectionPrompter extends CachedPrompter<ConnectionSummary> {
    public constructor(private readonly client: AppRunnerClient) {
        super()
    }

    protected load(): Promise<DataQuickPickItem<ConnectionSummary>[]> {
        return this.client
            .listConnections({})
            .then(resp => {
                const connections = resp.ConnectionSummaryList.filter(conn => conn.Status === 'AVAILABLE').map(
                    conn => ({
                        label: conn.ConnectionName!,
                        data: conn,
                    })
                )

                if (connections.length === 0) {
                    return [
                        {
                            label: 'No connections found',
                            detail: 'Click for documentation on creating a new GitHub connection for App Runner',
                            data: {} as any,
                            invalidSelection: true,
                            onClick: vscode.env.openExternal.bind(
                                vscode.env,
                                vscode.Uri.parse(APPRUNNER_CONNECTION_HELP_URL)
                            ),
                        },
                    ]
                } else {
                    return connections
                }
            })
            .catch(err => {
                getLogger().error(`Failed to list GitHub connections: %O`, err)
                return [
                    {
                        label: localize(
                            'AWS.apprunner.createService.selectConnection.failed',
                            'Failed to list GitHub connections'
                        ),
                        description: localize('AWS.generic.goBack', 'Click to go back'),
                        data: WIZARD_BACK,
                    },
                ]
            })
    }

    protected createPrompter(loader: CachedFunction<ConnectionPrompter['load']>): QuickPickPrompter<ConnectionSummary> {
        const connections = loader()
        const refreshButton = createRefreshButton()
        const prompter = createQuickPick(connections, {
            title: localize('AWS.apprunner.createService.selectConnection.title', 'Select a connection'),
            buttons: [refreshButton, ...makeButtons(APPRUNNER_CONNECTION_HELP_URL)],
        })

        const refresh = () => {
            loader.clearCache()
            prompter.clearAndLoadItems(loader())
        }

        refreshButton.onClick = refresh

        return prompter
    }
}

function createSourcePrompter(): QuickPickPrompter<AppRunner.ConfigurationSource> {
    const configDetail = localize(
        'AWS.apprunner.createService.configSource.detail',
        'App Runner will read "apprunner.yaml" in the root of your repository for configuration details'
    )
    const apiLabel = localize('AWS.apprunner.createService.configSource.apiLabel', 'Configure all settings here')
    const repoLabel = localize('AWS.apprunner.createService.configSource.repoLabel', 'Use configuration file')

    return createQuickPick(
        [
            { label: apiLabel, data: 'API' },
            { label: repoLabel, data: 'REPOSITORY', detail: configDetail },
        ],
        {
            title: localize('AWS.apprunner.createService.configSource.title', 'Choose configuration source'),
            buttons: makeButtons(APPRUNNER_CONFIGURATION_HELP_URL),
        }
    )
}

function createCodeRepositorySubForm(git: GitExtension): WizardForm<AppRunner.CodeRepository> {
    const subform = new WizardForm<AppRunner.CodeRepository>()
    const form = subform.body

    form.RepositoryUrl.bindPrompter(() => createRepoPrompter(git).transform(r => r.fetchUrl!))
    form.SourceCodeVersion.Value.bindPrompter(state =>
        createBranchPrompter(git, state.stepCache, state.RepositoryUrl).transform(resp =>
            resp.replace(`${state.RepositoryUrl}/`, '')
        )
    )
    form.CodeConfiguration.ConfigurationSource.bindPrompter(createSourcePrompter)
    form.SourceCodeVersion.Type.setDefault(() => 'BRANCH')

    const codeConfigForm = new WizardForm<AppRunner.CodeConfigurationValues>()
    codeConfigForm.body.Runtime.bindPrompter(createRuntimePrompter)
    codeConfigForm.body.BuildCommand.bindPrompter(state => createBuildCommandPrompter(state.Runtime!))
    codeConfigForm.body.StartCommand.bindPrompter(state => createStartCommandPrompter(state.Runtime!))
    codeConfigForm.body.Port.bindPrompter(createPortPrompter)
    codeConfigForm.body.RuntimeEnvironmentVariables.bindPrompter(() => createVariablesPrompter(makeButtons()))
    // TODO: ask user if they would like to save their parameters into an App Runner config file

    form.CodeConfiguration.CodeConfigurationValues.applyBoundForm(codeConfigForm, {
        showWhen: state => state.CodeConfiguration?.ConfigurationSource === 'API',
    })

    return subform
}

export class AppRunnerCodeRepositoryWizard extends Wizard<AppRunner.SourceConfiguration> {
    constructor(
        client: AppRunnerClient,
        git: GitExtension,
        autoDeployButton: QuickInputToggleButton = makeDeploymentButton()
    ) {
        super()
        const form = this.form
        const connectionPrompter = new ConnectionPrompter(client)

        form.AuthenticationConfiguration.ConnectionArn.bindPrompter(
            connectionPrompter.transform(conn => conn.ConnectionArn!)
        )
        form.CodeRepository.applyBoundForm(createCodeRepositorySubForm(git))
        form.AutoDeploymentsEnabled.setDefault(() => autoDeployButton.state === 'on')
    }
}
