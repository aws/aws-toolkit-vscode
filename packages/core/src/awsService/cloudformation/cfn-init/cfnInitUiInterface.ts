/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { CfnInitCliCaller, EnvironmentOption } from './cfnInitCliCaller'
import { Auth } from '../../../auth/auth'
import { promptForConnection } from '../../../auth/utils'
import { getEnvironmentName, getProjectName, getProjectPath } from '../ui/inputBox'

interface FormState {
    projectName?: string
    projectPath?: string
    environments: EnvironmentOption[]
}

export class CfnInitUiInterface {
    private state: FormState = { environments: [] }

    constructor(private cfnInitService: CfnInitCliCaller) {}

    async promptForCreate() {
        try {
            // Set default project path
            this.state.projectPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd()
            await this.showForm()
        } catch (error) {
            void vscode.window.showErrorMessage(`CFN Init failed: ${error}`)
        }
    }

    private async showForm(): Promise<boolean> {
        const quickPick = vscode.window.createQuickPick()
        quickPick.title = 'CFN Init: Initialize Project'
        quickPick.placeholder = 'Configure your CloudFormation project'
        quickPick.buttons = [{ iconPath: new vscode.ThemeIcon('check'), tooltip: 'Create Project' }]

        return new Promise((resolve) => {
            const updateItems = () => {
                const items = [
                    {
                        label: `${this.state.projectName ? '[✓]' : '[ ]'} Project Name`,
                        detail: this.state.projectName || 'Click to set project name',
                    },
                    {
                        label: `${this.state.projectPath ? '[✓]' : '[ ]'} Project Path`,
                        detail: this.state.projectPath || 'Click to set project path',
                    },
                ]

                // Add environment items
                for (const [_index, env] of this.state.environments.entries()) {
                    items.push({
                        label: `Adding Environment: ${env.name}`,
                        detail: `AWS Profile: ${env.awsProfile}`,
                    })
                }

                items.push({
                    label: '$(plus) Add Environment (At least one required)',
                    detail: 'Configure a new deployment environment',
                })

                if (this.state.environments.length > 0) {
                    items.push({
                        label: '$(trash) Delete Environment',
                        detail: 'Remove an existing environment',
                    })
                }

                quickPick.items = items
            }

            updateItems()

            quickPick.onDidAccept(async () => {
                const selected = quickPick.selectedItems[0]
                if (!selected) {
                    return
                }

                if (selected.label.includes('Project Name')) {
                    const name = await getProjectName(this.state.projectName)

                    if (name) {
                        this.state.projectName = name
                    }
                } else if (selected.label.includes('Project Path')) {
                    const currentPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '.'

                    const pathInput = await getProjectPath(this.state.projectPath || currentPath)

                    if (pathInput !== undefined) {
                        this.state.projectPath = pathInput.trim() || currentPath
                    }
                } else if (selected.label.includes('Add Environment')) {
                    await this.addEnvironment()
                } else if (selected.label.includes('Delete Environment')) {
                    await this.deleteEnvironment()
                }

                updateItems()
                quickPick.show()
            })

            quickPick.onDidTriggerButton(async () => {
                if (!this.state.projectName) {
                    void vscode.window.showWarningMessage('Project name is required')
                    return
                }
                if (!this.state.projectPath) {
                    void vscode.window.showWarningMessage('Project path is required')
                    return
                }
                if (this.state.environments.length === 0) {
                    void vscode.window.showWarningMessage('At least one environment is required')
                    return
                }
                quickPick.hide()
                resolve(true)
                await this.executeProject()
            })

            quickPick.onDidHide(() => resolve(false))
            quickPick.show()
        })
    }

    async collectEnvironmentConfig(): Promise<EnvironmentOption | undefined> {
        const envName = await getEnvironmentName()

        if (!envName) {
            return undefined
        }

        const connection = await promptForConnection(Auth.instance, 'iam-only')
        if (!connection) {
            return undefined
        }

        if (connection.type !== 'iam') {
            void vscode.window.showErrorMessage('Must select a valid IAM Profile for environment setup')
            return undefined
        }

        const selectedProfile = connection.id.replace('profile:', '')

        const addParamsFile = await vscode.window.showQuickPick(['Yes', 'No'], {
            placeHolder: 'Import parameters files?',
        })

        const environment: EnvironmentOption = {
            name: envName,
            awsProfile: selectedProfile,
        }

        if (addParamsFile === 'Yes') {
            const result = await vscode.window.showOpenDialog({
                canSelectFiles: true,
                canSelectMany: true,
                filters: { 'Parameters Files': ['json', 'yaml', 'yml'] },
            })
            if (result && result.length > 0) {
                environment.parametersFiles = result.map((uri) => uri.fsPath)
            }
        }

        return environment
    }

    private async addEnvironment() {
        const environment = await this.collectEnvironmentConfig()
        if (!environment) {
            return
        }

        // Check for duplicate names
        if (this.state.environments.some((e) => e.name === environment.name)) {
            void vscode.window.showErrorMessage('Environment name already exists')
            return
        }

        this.state.environments.push(environment)
    }

    private async deleteEnvironment() {
        if (this.state.environments.length === 0) {
            return
        }

        const envNames = this.state.environments.map((env) => env.name)
        const selected = await vscode.window.showQuickPick(envNames, {
            placeHolder: 'Select environment to delete',
        })

        if (selected) {
            this.state.environments = this.state.environments.filter((env) => env.name !== selected)
        }
    }

    private async executeProject() {
        const progress = vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: 'Creating CFN project...',
                cancellable: false,
            },
            async (progress) => {
                progress.report({ increment: 25, message: 'Creating project...' })

                const projectPath = this.state.projectPath || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '.'

                const result = await this.cfnInitService.createProject(this.state.projectName!, {
                    projectPath,
                    environments: this.state.environments,
                })

                if (!result.success) {
                    throw new Error(result.error)
                }

                progress.report({ increment: 100, message: 'Complete!' })
            }
        )

        await progress
        void vscode.window.showInformationMessage(`CFN project '${this.state.projectName}' created!`)

        const openProject = await vscode.window.showQuickPick(['Yes', 'No'], {
            placeHolder: 'Open project folder in new window?',
        })

        if (openProject === 'Yes') {
            const finalPath = this.state.projectPath || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '.'
            const uri = vscode.Uri.file(finalPath)
            await vscode.commands.executeCommand('vscode.openFolder', uri, true)
        }
    }
}
