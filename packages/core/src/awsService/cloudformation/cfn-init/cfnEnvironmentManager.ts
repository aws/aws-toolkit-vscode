/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Disposable, Uri, window, workspace, commands } from 'vscode'
import { Auth } from '../../../auth/auth'
import { commandKey, extractErrorMessage, formatMessage, toString } from '../utils'
import {
    CfnConfig,
    CfnEnvironmentConfig,
    CfnEnvironmentLookup,
    DeploymentConfig,
    CfnEnvironmentFileSelectorItem as DeploymentFileDetail,
    CfnEnvironmentFileSelectorItem,
} from './cfnProjectTypes'
import path from 'path'
import fs from '../../../shared/fs/fs'
import { CfnEnvironmentSelector } from '../ui/cfnEnvironmentSelector'
import { CfnEnvironmentFileSelector } from '../ui/cfnEnvironmentFileSelector'
import globals from '../../../shared/extensionGlobals'
import { TemplateParameter } from '../stacks/actions/stackActionRequestType'
import { validateParameterValue } from '../stacks/actions/stackActionInputValidation'
import { getLogger } from '../../../shared/logger/logger'
import { DocumentInfo } from './cfnEnvironmentRequestType'
import { parseCfnEnvironmentFiles } from './cfnEnvironmentApi'
import { LanguageClient } from 'vscode-languageclient/node'
import { Parameter } from '@aws-sdk/client-cloudformation'
import { convertRecordToParameters, convertRecordToTags } from './utils'

export class CfnEnvironmentManager implements Disposable {
    private readonly cfnProjectPath = 'cfn-project'
    private readonly configFile = 'cfn-config.json'
    private readonly environmentsDirectory = 'environments'
    private readonly selectedEnvironmentKey = 'aws.cloudformation.selectedEnvironment'
    private readonly auth = Auth.instance
    private listeners: (() => void)[] = []

    private readonly initializeOption = 'Initialize Project'

    constructor(
        private readonly client: LanguageClient,
        private readonly environmentSelector: CfnEnvironmentSelector,
        private readonly environmentFileSelector: CfnEnvironmentFileSelector
    ) {}

    public addListener(listener: () => void): void {
        this.listeners.push(listener)
    }

    public getSelectedEnvironmentName(): string | undefined {
        return globals.context.workspaceState.get(this.selectedEnvironmentKey)
    }

    private notifyListeners(): void {
        for (const listener of this.listeners) {
            listener()
        }
    }

    public async promptInitializeIfNeeded(operation: string): Promise<boolean> {
        if (!(await this.isProjectInitialized())) {
            const choice = await window.showWarningMessage(
                `You must initialize your CFN Project to perform ${operation}`,
                this.initializeOption
            )

            if (choice === this.initializeOption) {
                void commands.executeCommand(commandKey('init.initializeProject'))
            }
            return true
        }

        return false
    }

    public async selectEnvironment(): Promise<void> {
        if (await this.promptInitializeIfNeeded('Environment Selection')) {
            return
        }

        let environmentLookup: CfnEnvironmentLookup

        try {
            environmentLookup = await this.fetchAvailableEnvironments()
        } catch (error) {
            void window.showErrorMessage(
                formatMessage(`Failed to retrieve environments from configuration: ${toString(error)}`)
            )
            return
        }

        const environmentName = await this.environmentSelector.selectEnvironment(environmentLookup)

        if (environmentName) {
            await this.setSelectedEnvironment(environmentName, environmentLookup)
        }
    }

    private async isProjectInitialized(): Promise<boolean> {
        const configPath = await this.getConfigPath()
        const projectDirectory = await this.getProjectDir()

        return (await fs.existsFile(configPath)) && (await fs.existsDir(projectDirectory))
    }

    private async setSelectedEnvironment(
        environmentName: string,
        environmentLookup: CfnEnvironmentLookup
    ): Promise<void> {
        const environment = environmentLookup[environmentName]

        if (environment) {
            await globals.context.workspaceState.update(this.selectedEnvironmentKey, environmentName)

            await this.syncEnvironmentWithProfile(environment)
        }

        this.notifyListeners()
    }

    private async syncEnvironmentWithProfile(environment: CfnEnvironmentConfig) {
        const profileName = environment.profile

        const currentConnection = await this.auth.getConnection({ id: `profile:${profileName}` })

        if (!currentConnection) {
            void window.showErrorMessage(formatMessage(`No connection found for profile: ${profileName}`))
            return
        }

        await this.auth.useConnection(currentConnection)
    }

    public async fetchAvailableEnvironments(): Promise<CfnEnvironmentLookup> {
        const configPath = await this.getConfigPath()
        const config = JSON.parse(await fs.readFileText(configPath)) as CfnConfig

        return config.environments
    }

    public async selectEnvironmentFile(
        templateUri: string,
        requiredParameters: TemplateParameter[]
    ): Promise<CfnEnvironmentFileSelectorItem | undefined> {
        const environmentName = this.getSelectedEnvironmentName()
        const selectorItems: CfnEnvironmentFileSelectorItem[] = []

        if (!environmentName) {
            return undefined
        }

        try {
            const environmentDir = await this.getEnvironmentDir(environmentName)
            const files = await fs.readdir(environmentDir)

            const filesToParse: DocumentInfo[] = await Promise.all(
                files
                    .filter(
                        ([fileName]) =>
                            fileName.endsWith('.json') || fileName.endsWith('.yaml') || fileName.endsWith('.yml')
                    )
                    .map(async ([fileName]) => {
                        const filePath = path.join(environmentDir, fileName)
                        const content = await fs.readFileText(filePath)
                        const type = fileName.endsWith('.json') ? 'JSON' : 'YAML'

                        return {
                            type,
                            content,
                            fileName,
                        }
                    })
            )

            const environmentFiles = await parseCfnEnvironmentFiles(this.client, { documents: filesToParse })

            for (const deploymentFile of environmentFiles) {
                const item = await this.createEnvironmentFileSelectorItem(
                    deploymentFile.fileName,
                    deploymentFile.deploymentConfig,
                    requiredParameters,
                    templateUri
                )
                if (item) {
                    selectorItems.push(item)
                }
            }
        } catch (error) {
            void window.showErrorMessage(`Error loading deployment files: ${extractErrorMessage(error)}`)
            return undefined
        }

        return await this.environmentFileSelector.selectEnvironmentFile(selectorItems, requiredParameters.length)
    }

    private async createEnvironmentFileSelectorItem(
        fileName: string,
        deploymentConfig: DeploymentConfig,
        requiredParameters: TemplateParameter[],
        templateUri: string
    ): Promise<DeploymentFileDetail | undefined> {
        try {
            return {
                fileName: fileName,
                hasMatchingTemplatePath:
                    workspace.asRelativePath(Uri.parse(templateUri)) === deploymentConfig.templateFilePath,
                compatibleParameters: this.getCompatibleParams(deploymentConfig, requiredParameters),
                optionalFlags: {
                    tags: deploymentConfig.tags ? convertRecordToTags(deploymentConfig.tags) : undefined,
                    includeNestedStacks: deploymentConfig.includeNestedStacks,
                    importExistingResources: deploymentConfig.importExistingResources,
                    onStackFailure: deploymentConfig.onStackFailure,
                },
            }
        } catch (error) {
            getLogger().warn(`Failed to create selector item ${fileName}:`, error)
        }
    }

    private getCompatibleParams(
        deploymentConfig: DeploymentConfig,
        requiredParameters: TemplateParameter[]
    ): Parameter[] | undefined {
        if (deploymentConfig.parameters && requiredParameters.length > 0) {
            const parameters = deploymentConfig.parameters

            // Filter only parameters that are in template and are valid
            const validParams = requiredParameters.filter((templateParam) => {
                if (!(templateParam.name in parameters)) {
                    return false
                }
                const value = parameters[templateParam.name]
                return validateParameterValue(value, templateParam) === undefined
            })

            const validParameterNames = validParams.map((p) => p.name)
            const filteredParameters = Object.fromEntries(
                Object.entries(parameters).filter(([key]) => validParameterNames.includes(key))
            )

            return convertRecordToParameters(filteredParameters)
        }
    }

    public async getEnvironmentDir(environmentName: string): Promise<string> {
        const workspaceRoot = workspace.workspaceFolders?.[0]?.uri.fsPath
        if (!workspaceRoot) {
            throw new Error('No workspace folder found')
        }
        return path.join(workspaceRoot, this.cfnProjectPath, this.environmentsDirectory, environmentName)
    }

    private async getConfigPath(): Promise<string> {
        const workspaceRoot = workspace.workspaceFolders?.[0]?.uri.fsPath
        if (!workspaceRoot) {
            throw new Error('No workspace folder found')
        }
        return path.join(workspaceRoot, this.cfnProjectPath, this.configFile)
    }

    private async getProjectDir(): Promise<string> {
        const workspaceRoot = workspace.workspaceFolders?.[0]?.uri.fsPath
        if (!workspaceRoot) {
            throw new Error('No workspace folder found')
        }
        return path.join(workspaceRoot, this.cfnProjectPath)
    }

    dispose(): void {
        // No resources to dispose
    }
}
