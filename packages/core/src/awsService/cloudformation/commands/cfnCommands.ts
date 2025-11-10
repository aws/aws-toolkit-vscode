/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { commands, env, Uri, window, workspace, Range, Selection, TextEditorRevealType, ProgressLocation } from 'vscode'
import { commandKey, extractErrorMessage, findParameterDescriptionPosition } from '../utils'
import { LanguageClient } from 'vscode-languageclient/node'
import { Command } from 'vscode-languageclient/node'
import * as yaml from 'js-yaml'

import { Deployment } from '../stacks/actions/deploymentWorkflow'
import { Parameter, Capability, OnStackFailure, Stack } from '@aws-sdk/client-cloudformation'
import {
    getParameterValues,
    getStackName,
    getTemplatePath,
    confirmCapabilities,
    shouldImportResources,
    getResourcesToImport,
    getEnvironmentName,
    getChangeSetName,
    chooseOptionalFlagSuggestion as chooseOptionalFlagMode,
    getTags,
    getOnStackFailure,
    getIncludeNestedStacks,
    getImportExistingResources,
    shouldUploadToS3,
    getS3Bucket,
    getS3Key,
    shouldSaveFlagsToFile,
    getFilePath,
} from '../ui/inputBox'
import { setContext } from '../../../shared/vscode/setContext'
import { DiffWebviewProvider } from '../ui/diffWebviewProvider'
import { StackResourcesWebviewProvider } from '../ui/stackResourcesWebviewProvider'
import { showErrorMessage } from '../ui/message'
import { getLastValidation, setLastValidation, Validation } from '../stacks/actions/validationWorkflow'
import {
    getParameters,
    getCapabilities,
    getTemplateResources,
    getTemplateArtifacts,
    describeChangeSet,
} from '../stacks/actions/stackActionApi'
import {
    ChangeSetOptionalFlags,
    OptionalFlagMode,
    TemplateParameter,
    ResourceToImport,
    ChangeSetReference,
} from '../stacks/actions/stackActionRequestType'
import { StackInfo } from '../stacks/actions/stackActionRequestType'
import { ResourceNode } from '../explorer/nodes/resourceNode'
import { ResourcesManager } from '../resources/resourcesManager'
import { RelatedResourcesManager } from '../relatedResources/relatedResourcesManager'
import { DocumentManager } from '../documents/documentManager'
import { CfnEnvironmentManager } from '../cfn-init/cfnEnvironmentManager'

import { StackOverviewWebviewProvider } from '../ui/stackOverviewWebviewProvider'
import { StackEventsWebviewProvider } from '../ui/stackEventsWebviewProvider'
import { StackOutputsWebviewProvider } from '../ui/stackOutputsWebviewProvider'
import { ResourceContextValue } from '../explorer/contextValue'
import { getLogger } from '../../../shared/logger/logger'
import { CloudFormationExplorer } from '../explorer/explorer'
import { StacksNode } from '../explorer/nodes/stacksNode'
import { ResourcesNode } from '../explorer/nodes/resourcesNode'
import { ResourceTypeNode } from '../explorer/nodes/resourceTypeNode'
import { StackChangeSetsNode } from '../explorer/nodes/stackChangeSetsNode'
import { CfnInitCliCaller } from '../cfn-init/cfnInitCliCaller'
import { CfnInitUiInterface } from '../cfn-init/cfnInitUiInterface'
import { ChangeSetDeletion } from '../stacks/actions/changeSetDeletionWorkflow'
import { fs } from '../../../shared/fs/fs'
import { convertParametersToRecord, convertTagsToRecord } from '../cfn-init/utils'
import { StackNode } from '../explorer/nodes/stackNode'
import { DescribeStackRequest } from '../stacks/actions/stackActionProtocol'

export function validateDeploymentCommand(
    client: LanguageClient,
    diffProvider: DiffWebviewProvider,
    documentManager: DocumentManager,
    environmentManager: CfnEnvironmentManager
) {
    return commands.registerCommand(
        commandKey('api.validateDeployment'),
        async (changeSetParams: string | StackNode | StacksNode) => {
            try {
                const result = await changeSetSteps(
                    client,
                    documentManager,
                    environmentManager,
                    true,
                    typeof changeSetParams === 'string' ? changeSetParams : undefined,
                    changeSetParams instanceof StackNode ? changeSetParams?.stack.StackName : undefined
                )
                if (!result) {
                    return
                }

                const validation = new Validation(
                    result.templateUri,
                    result.stackName,
                    client,
                    diffProvider,
                    result.parameters,
                    result.capabilities,
                    result.resourcesToImport,
                    false,
                    result.optionalFlags,
                    result.s3Bucket,
                    result.s3Key
                )

                setLastValidation(validation)

                await validation.validate()
            } catch (error) {
                showErrorMessage(`Error validating template: ${extractErrorMessage(error)}`)
            }
        }
    )
}

export function deployTemplateFromStacksMenuCommand() {
    return commands.registerCommand(commandKey('api.deployTemplateFromStacksMenu'), async () => {
        return commands.executeCommand(commandKey('api.deployTemplate'))
    })
}

export function executeChangeSetCommand(client: LanguageClient) {
    return commands.registerCommand(
        commandKey('api.executeChangeSet'),
        async (stackName: string, changeSetName: string) => {
            try {
                const deployment = new Deployment(stackName, changeSetName, client)

                await deployment.deploy()
            } catch (error) {
                showErrorMessage(`Error executing change set: ${extractErrorMessage(error)}`)
            }
        }
    )
}

export function deleteChangeSetCommand(client: LanguageClient) {
    return commands.registerCommand(commandKey('stacks.deleteChangeSet'), async (params?: ChangeSetReference) => {
        try {
            params = params ?? (await promptForChangeSetReference())

            if (!params) {
                return
            }

            const changeSetDeletion = new ChangeSetDeletion(params.stackName, params.changeSetName, client)

            await changeSetDeletion.delete()
        } catch (error) {
            showErrorMessage(`Error deleting change set: ${extractErrorMessage(error)}`)
        }
    })
}

export function viewChangeSetCommand(client: LanguageClient, diffProvider: DiffWebviewProvider) {
    return commands.registerCommand(commandKey('stacks.viewChangeSet'), async (params?: ChangeSetReference) => {
        try {
            params = params ?? (await promptForChangeSetReference())

            if (!params) {
                return
            }

            const describeChangeSetResult = await describeChangeSet(client, {
                changeSetName: params.changeSetName,
                stackName: params.stackName,
            })

            void setContext('aws.cloudformation.stacks.diffVisible', true)

            diffProvider.updateData(params.stackName, describeChangeSetResult.changes, params.changeSetName, true)
            void commands.executeCommand(commandKey('diff.focus'))
        } catch (error) {
            showErrorMessage(`Error viewing change set: ${extractErrorMessage(error)}`)
        }
    })
}

async function promptForChangeSetReference(): Promise<ChangeSetReference | undefined> {
    const stackName = await getStackName()
    const changeSetName = await getChangeSetName()
    if (!stackName || !changeSetName) {
        return undefined
    }

    return { stackName: stackName, changeSetName: changeSetName }
}

export function deployTemplateCommand(
    client: LanguageClient,
    diffProvider: DiffWebviewProvider,
    documentManager: DocumentManager,
    environmentManager: CfnEnvironmentManager
) {
    return commands.registerCommand(commandKey('api.deployTemplate'), async (changeSetParams?: string | StackNode) => {
        try {
            const result = await changeSetSteps(
                client,
                documentManager,
                environmentManager,
                false,
                typeof changeSetParams === 'string' ? changeSetParams : undefined,
                typeof changeSetParams === 'object' ? changeSetParams?.stack.StackName : undefined
            )
            if (!result) {
                return
            }

            const validation = new Validation(
                result.templateUri,
                result.stackName,
                client,
                diffProvider,
                result.parameters,
                result.capabilities,
                result.resourcesToImport,
                true, // Confirm deployment following successful validation
                result.optionalFlags,
                result.s3Bucket,
                result.s3Key
            )

            setLastValidation(validation)

            await validation.validate()
        } catch (error) {
            showErrorMessage(`Error deploying template ${extractErrorMessage(error)}`)
        }
    })
}

async function promptForResourceImport(client: LanguageClient, templateUri: string) {
    const importMode = await shouldImportResources()
    let resourcesToImport
    if (importMode) {
        const templateResources = await getTemplateResources(client, templateUri)
        if (!templateResources || templateResources.length === 0) {
            showErrorMessage('No resources found in template to import')
            return
        }

        resourcesToImport = await getResourcesToImport(templateResources)
        if (!resourcesToImport || resourcesToImport.length === 0) {
            return
        }
    }
    return resourcesToImport
}

type OptionalFlagSelection = ChangeSetOptionalFlags & {
    shouldSaveOptions?: boolean
}

export async function promptForOptionalFlags(
    fileFlags?: ChangeSetOptionalFlags,
    stackDetails?: Stack
): Promise<OptionalFlagSelection | undefined> {
    if (fileFlags && Object.values(fileFlags).every((v) => v !== undefined)) {
        return {
            ...fileFlags,
            shouldSaveOptions: false,
        }
    }

    let optionalFlags: OptionalFlagSelection | undefined

    const optionSelection = await chooseOptionalFlagMode()

    switch (optionSelection) {
        case OptionalFlagMode.Skip:
            optionalFlags = {
                onStackFailure: fileFlags?.onStackFailure,
                includeNestedStacks: fileFlags?.includeNestedStacks,
                tags: fileFlags?.tags,
                importExistingResources: fileFlags?.importExistingResources,
                shouldSaveOptions: false,
            }

            break
        case OptionalFlagMode.Input:
            optionalFlags = {
                onStackFailure: fileFlags?.onStackFailure ?? (await getOnStackFailure()),
                includeNestedStacks: fileFlags?.includeNestedStacks ?? (await getIncludeNestedStacks()),
                tags: fileFlags?.tags ?? (await getTags(stackDetails?.Tags)),
                importExistingResources: fileFlags?.importExistingResources ?? (await getImportExistingResources()),
            }

            if (!fileFlags && Object.values(optionalFlags).some((val) => val !== undefined)) {
                optionalFlags.shouldSaveOptions = true
            }

            break
        case OptionalFlagMode.DevFriendly:
            optionalFlags = {
                onStackFailure: OnStackFailure.DO_NOTHING,
                includeNestedStacks: true,
                tags: fileFlags?.tags ?? (await getTags(stackDetails?.Tags)),
                importExistingResources: true,
            }

            if (!fileFlags && optionalFlags.tags) {
                optionalFlags.shouldSaveOptions = true
            }

            break
        default:
            optionalFlags = undefined
    }

    return optionalFlags
}

export async function promptToSaveToFile(
    environmentDir: string,
    optionalFlags?: ChangeSetOptionalFlags,
    parameters?: Parameter[]
): Promise<void> {
    const shouldSave = await shouldSaveFlagsToFile()

    if (!shouldSave) {
        return
    }

    const filePath = await getFilePath(environmentDir)

    if (!filePath) {
        return
    }

    const data = {
        parameters: parameters ? convertParametersToRecord(parameters) : undefined,
        tags: optionalFlags?.tags ? convertTagsToRecord(optionalFlags?.tags) : undefined,
        'on-stack-failure': optionalFlags?.onStackFailure,
        'include-nested-stacks': optionalFlags?.includeNestedStacks,
        'import-existing-resources': optionalFlags?.importExistingResources,
    }

    // Determine file type and format accordingly
    const isJsonFile = filePath.endsWith('.json')
    const config = workspace.getConfiguration('editor')
    const tabSize = config.get<number>('tabSize', 2)
    const insertSpaces = config.get<boolean>('insertSpaces', true)
    let content: string

    try {
        if (isJsonFile) {
            // JSON allows both tabs and spaces - respect user preference
            const indent = insertSpaces ? tabSize : '\t'
            content = JSON.stringify(data, undefined, indent)
        } else {
            // YAML spec requires spaces for indentation - always use spaces
            content = yaml.dump(data, { indent: tabSize, noRefs: true, sortKeys: true })
        }
    } catch (error) {
        showErrorMessage(`Failed to format deployment options: ${extractErrorMessage(error)}`)
        return
    }

    try {
        await fs.writeFile(filePath, content)
        void window.showInformationMessage(`options saved to: ${filePath}`)
    } catch (error) {
        showErrorMessage(`Failed to save deployment options file: ${extractErrorMessage(error)}`)
    }
}

async function validateArtifactPaths(client: LanguageClient, templateUri: string): Promise<boolean | undefined> {
    try {
        const artifactsResult = await getTemplateArtifacts(client, templateUri)
        if (artifactsResult.artifacts.length === 0) {
            return false
        }

        for (const artifact of artifactsResult.artifacts) {
            const artifactPath = artifact.filePath.startsWith('/')
                ? artifact.filePath
                : Uri.joinPath(Uri.parse(templateUri), '..', artifact.filePath).fsPath

            if (!(await fs.exists(artifactPath))) {
                showErrorMessage(`Artifact path does not exist: ${artifact.filePath}`)
                return undefined
            }
        }
        return true
    } catch (error) {
        getLogger().warn(`Failed to check for artifacts: ${error}`)
        return false
    }
}

type UserInputtedTemplateParameters = {
    templateUri: string
    stackName: string
    parameters: Parameter[] | undefined
    capabilities: Capability[]
    resourcesToImport: ResourceToImport[] | undefined
    optionalFlags: ChangeSetOptionalFlags | undefined
    s3Bucket?: string
    s3Key?: string
}

async function changeSetSteps(
    client: LanguageClient,
    documentManager: DocumentManager,
    environmentManager: CfnEnvironmentManager,
    isValidation: boolean,
    templateUri: string | undefined,
    stackName: string | undefined
): Promise<UserInputtedTemplateParameters | undefined> {
    templateUri ??= await getTemplatePath(documentManager)
    if (!templateUri) {
        return
    }

    await ensureFileIsOpen(templateUri)

    // Check for artifacts first
    const hasArtifacts = await validateArtifactPaths(client, templateUri)
    if (hasArtifacts === undefined) {
        return // Error occurred during validation
    }

    // Ask user if they want to upload to S3
    let s3Bucket: string | undefined
    let s3Key: string | undefined
    const uploadChoice = await shouldUploadToS3()
    if (uploadChoice === undefined) {
        return // User chose to configure settings, exit command
    }
    if (uploadChoice) {
        s3Bucket = await getS3Bucket()
        if (!s3Bucket) {
            return
        }

        const fileName = templateUri.split('/').pop()
        const timestamp = Date.now()
        const fileNameWithTimestamp = fileName
            ? `${fileName.split('.')[0]}-${timestamp}.${fileName.split('.').pop()}`
            : `template-${timestamp}.yaml`
        s3Key = await getS3Key(fileNameWithTimestamp)
        if (!s3Key) {
            return
        }
    } else if (hasArtifacts) {
        s3Bucket = await getS3Bucket(
            'S3 bucket is required because template contains artifacts that need to be uploaded to S3'
        )
        if (!s3Bucket) {
            return
        }
    }

    if (!stackName) {
        if (isValidation) {
            stackName = await getStackName(getLastValidation()?.stackName)
        } else {
            stackName = await getStackName()
        }
        // User cancelled
        if (!stackName) {
            return
        }
    }

    const stackDetails = await getStackDetails(client, stackName)

    const resourcesToImport = await promptForResourceImport(client, templateUri)

    const paramDefinition = await getTemplateParameters(client, templateUri)
    let parameters: Parameter[] | undefined

    const environmentFile = await environmentManager.selectEnvironmentFile(templateUri, paramDefinition)

    if (paramDefinition.length > 0) {
        parameters = environmentFile?.compatibleParameters

        // Prompt for any remaining parameters not provided by file
        const providedParamNames = parameters?.map((p) => p.ParameterKey) ?? []
        const remainingParams = paramDefinition.filter((p) => !providedParamNames.includes(p.name))

        if (remainingParams.length > 0) {
            let prefilledParams: Parameter[] | undefined

            if (stackDetails) {
                prefilledParams = stackDetails.Parameters
            } else if (isValidation) {
                prefilledParams = getLastValidation()?.parameters
            }

            const additionalParams = await getParameterValues(remainingParams, prefilledParams)

            if (!additionalParams) {
                return
            }

            parameters = [...(parameters ?? []), ...additionalParams]
        }
    }
    if (paramDefinition.length > 0 && !parameters) {
        return
    }

    const optionalFlags = await promptForOptionalFlags(environmentFile?.optionalFlags, stackDetails)
    const shouldSaveParameters = parameters && parameters.length > 0 && !environmentFile
    const selectedEnvironment = environmentManager.getSelectedEnvironmentName()

    if (selectedEnvironment && (shouldSaveParameters || optionalFlags?.shouldSaveOptions)) {
        await promptToSaveToFile(
            await environmentManager.getEnvironmentDir(selectedEnvironment),
            optionalFlags,
            parameters
        )
    }

    const capabilitiesResult = await getCapabilities(client, templateUri)
    const capabilities = await confirmCapabilities(capabilitiesResult.capabilities)
    if (capabilities === undefined) {
        return
    } // User cancelled
    return { templateUri, stackName, parameters, capabilities, resourcesToImport, optionalFlags, s3Bucket, s3Key }
}

export function rerunLastValidationCommand() {
    return commands.registerCommand(commandKey('api.rerunLastValidation'), async () => {
        try {
            const lastValidation = getLastValidation()
            if (!lastValidation) {
                showErrorMessage('No previous validation to rerun')
                return
            }
            await lastValidation.validate()
        } catch (error) {
            showErrorMessage(`Error rerunning validation: ${error instanceof Error ? error.message : String(error)}`)
        }
    })
}

async function ensureFileIsOpen(templateUri: string): Promise<void> {
    const uri = Uri.parse(templateUri)
    const openEditors = window.visibleTextEditors
    const isFileOpen = openEditors.some((editor) => editor.document.uri.toString() === uri.toString())

    if (!isFileOpen) {
        try {
            const document = await workspace.openTextDocument(uri)
            await window.showTextDocument(document)
        } catch (error) {
            getLogger().warn(`Could not open file: ${error}`)
            throw error
        }
    }
}

async function getStackDetails(client: LanguageClient, stackName: string) {
    let stackDetails: Stack | undefined

    try {
        stackDetails = (
            await client.sendRequest(DescribeStackRequest, {
                stackName: stackName,
            })
        ).stack
    } catch (error) {
        const errorMessage = extractErrorMessage(error)

        if (!errorMessage.toLowerCase().includes('does not exist')) {
            showErrorMessage(`Encountered error while extracting stack details: ${errorMessage}`)
        }
    }

    return stackDetails
}

async function getTemplateParameters(client: LanguageClient, templateUri: string): Promise<TemplateParameter[]> {
    try {
        const result = await getParameters(client, templateUri)
        return result.parameters
    } catch (error) {
        showErrorMessage(`Error getting template parameters: ${error instanceof Error ? error.message : String(error)}`)
        return []
    }
}

export const SelectResourceTypeCommand: Command = {
    title: 'Select Resource Types',
    command: commandKey('api.selectResourceTypes'),
    arguments: [],
}

export function selectResourceTypesCommand(resourcesManager: ResourcesManager) {
    return commands.registerCommand(
        commandKey('api.selectResourceTypes'),
        async () => await resourcesManager.selectResourceTypes()
    )
}

export function addResourceTypesCommand(resourcesManager: ResourcesManager) {
    return commands.registerCommand(
        commandKey('api.addResourceTypes'),
        async () => await resourcesManager.selectResourceTypes()
    )
}

export function importResourceStateCommand(resourcesManager: ResourcesManager) {
    return commands.registerCommand(
        commandKey('api.importResourceState'),
        async (node?: ResourceNode, selectedNodes?: ResourceNode[]) => {
            const nodes = selectedNodes ?? (node ? [node] : [])
            const resourceNodes = nodes.filter((n) => n.contextValue === ResourceContextValue)
            await resourcesManager.importResourceStates(resourceNodes)
        }
    )
}

export function cloneResourceStateCommand(resourcesManager: ResourcesManager) {
    return commands.registerCommand(
        commandKey('api.cloneResourceState'),
        async (node?: ResourceNode, selectedNodes?: ResourceNode[]) => {
            const nodes = selectedNodes ?? (node ? [node] : [])
            const resourceNodes = nodes.filter((n) => n.contextValue === ResourceContextValue)
            await resourcesManager.cloneResourceStates(resourceNodes)
        }
    )
}

export const RefreshResourceListCommand: Command = {
    title: 'Refresh Resource List',
    command: commandKey('api.refreshResourceList'),
    arguments: [],
}

export function copyResourceIdentifierCommand() {
    return commands.registerCommand(commandKey('api.copyResourceIdentifier'), async (resourceNode?: ResourceNode) => {
        if (resourceNode?.resourceIdentifier) {
            await env.clipboard.writeText(resourceNode.resourceIdentifier)
            window.setStatusBarMessage(`Resource identifier copied to clipboard`, 3000)
        }
    })
}

export function refreshAllResourcesCommand(resourcesManager: ResourcesManager) {
    return commands.registerCommand(commandKey('api.refreshAllResources'), () => {
        resourcesManager.refreshAllResources()
    })
}

export function refreshResourceListCommand(resourcesManager: ResourcesManager, explorer: CloudFormationExplorer) {
    return commands.registerCommand(RefreshResourceListCommand.command, async (resourceTypeNode?: ResourceTypeNode) => {
        if (!resourceTypeNode) {
            const children = await explorer.getChildren()
            const resourcesNode = children.find((child) => child instanceof ResourcesNode) as ResourcesNode | undefined
            if (!resourcesNode) {
                return
            }

            const resourceTypeNodes = (await resourcesNode.getChildren()) as ResourceTypeNode[]
            if (resourceTypeNodes.length === 0) {
                void window.showInformationMessage('No resource types selected')
                return
            }

            const selected = await window.showQuickPick(
                resourceTypeNodes.map((n) => ({ label: n.typeName, node: n })),
                { placeHolder: 'Select resource type to refresh' }
            )

            if (!selected) {
                return
            }

            resourceTypeNode = selected.node
        }

        resourcesManager.refreshResourceList(resourceTypeNode.typeName)
    })
}

export function viewStackDiffCommand() {
    return commands.registerCommand(commandKey('stacks.viewDiff'), () => {
        void setContext('aws.cloudformation.stacks.diffVisible', true)
        void commands.executeCommand(commandKey('diff.focus'))
    })
}

export function viewStackDetailCommand(resourcesProvider: StackResourcesWebviewProvider) {
    return commands.registerCommand(commandKey('stacks.viewDetail'), async (node?: any) => {
        void setContext('aws.cloudformation.stacks.detailVisible', true)

        const stackName = node?.stackName || 'Unknown Stack'

        await resourcesProvider.updateData(stackName)
        void commands.executeCommand(commandKey('detail.focus'))
    })
}

export function focusDiffCommand() {
    return commands.registerCommand(commandKey('diff.focus'), () => {
        void commands.executeCommand('workbench.view.extension.cfn-diff')
    })
}

export function getStackManagementInfoCommand(resourcesManager: ResourcesManager) {
    return commands.registerCommand(commandKey('api.getStackManagementInfo'), async (resourceNode?: ResourceNode) => {
        await resourcesManager.getStackManagementInfo(resourceNode)
    })
}

export function extractToParameterPositionCursorCommand() {
    return commands.registerCommand(
        'aws.cloudformation.extractToParameter.positionCursor',
        async (
            documentUri: string,
            parameterName: string,
            documentType: string,
            trackingCommand?: string,
            actionType?: string
        ) => {
            try {
                // Track code action acceptance if tracking parameters provided
                if (trackingCommand && actionType) {
                    await commands.executeCommand(trackingCommand, actionType)
                }

                const uri = Uri.parse(documentUri)
                const document = await workspace.openTextDocument(uri)
                const editor = await window.showTextDocument(document)

                const text = document.getText()
                const position = findParameterDescriptionPosition(text, parameterName, documentType)

                if (position) {
                    editor.selection = new Selection(position, position)
                    editor.revealRange(new Range(position, position), TextEditorRevealType.InCenter)
                }
            } catch (error) {
                getLogger().error(`Error positioning cursor in parameter description: ${error}`)
            }
        }
    )
}

export function loadMoreResourcesCommand(explorer: CloudFormationExplorer) {
    return commands.registerCommand(commandKey('api.loadMoreResources'), async (node?: ResourceTypeNode) => {
        if (!node) {
            const children = await explorer.getChildren()
            const resourcesNode = children.find((child) => child instanceof ResourcesNode) as ResourcesNode | undefined
            if (!resourcesNode) {
                return
            }

            const resourceTypeNodes = (await resourcesNode.getChildren()) as ResourceTypeNode[]
            const nodesWithMore = resourceTypeNodes.filter((n) => n.contextValue === 'resourceTypeWithMore')

            if (nodesWithMore.length === 0) {
                void window.showInformationMessage('No resource types have more resources to load')
                return
            }

            const selected = await window.showQuickPick(
                nodesWithMore.map((n) => ({ label: n.typeName, node: n })),
                { placeHolder: 'Select resource type to load more' }
            )

            if (!selected) {
                return
            }

            node = selected.node
        }

        await node.loadMoreResources()
        explorer.refresh(node)
    })
}

export function loadMoreStacksCommand(explorer: CloudFormationExplorer) {
    return commands.registerCommand(commandKey('api.loadMoreStacks'), async (node?: StacksNode) => {
        if (!node) {
            const children = await explorer.getChildren()
            node = children.find((child) => child instanceof StacksNode) as StacksNode | undefined
            if (!node) {
                return
            }
        }

        if (node.contextValue !== 'stackSectionWithMore') {
            void window.showInformationMessage('No more stacks to load')
            return
        }

        const stacksNode = node
        await window.withProgress(
            {
                location: ProgressLocation.Notification,
                title: 'Loading More Stacks',
            },
            async () => {
                await stacksNode.loadMoreStacks()
                explorer.refresh(stacksNode)
            }
        )
    })
}

export function searchResourceCommand(explorer: CloudFormationExplorer, resourcesManager: ResourcesManager) {
    return commands.registerCommand(commandKey('api.searchResource'), async (node: ResourceTypeNode) => {
        const identifier = await window.showInputBox({
            prompt: `Enter ${node.label} identifier to search`,
            placeHolder: 'Resource identifier',
        })

        if (!identifier) {
            return
        }

        const result = await resourcesManager.searchResource(node.label as string, identifier)

        if (result.found) {
            void window.showInformationMessage(`Resource found: ${identifier}`)
            explorer.refresh(node)
        } else {
            void window.showErrorMessage(`Resource not found: ${identifier}`)
        }
    })
}

export function refreshChangeSetsCommand(explorer: CloudFormationExplorer) {
    return commands.registerCommand(commandKey('stacks.refreshChangeSets'), async (node: StackChangeSetsNode) => {
        explorer.refresh(node)
    })
}

export function loadMoreChangeSetsCommand(explorer: CloudFormationExplorer) {
    return commands.registerCommand(commandKey('api.loadMoreChangeSets'), async (node: StackChangeSetsNode) => {
        await node.loadMoreChangeSets()
        explorer.refresh(node)
    })
}

export function showStackOverviewCommand(overviewProvider: StackOverviewWebviewProvider) {
    return commands.registerCommand(commandKey('api.showStackOverview'), async (stack: StackInfo) => {
        await overviewProvider.showStackOverview(stack)
    })
}

export function showStackEventsCommand(eventsProvider: StackEventsWebviewProvider) {
    return commands.registerCommand(commandKey('stack.events.show'), async (stackName: string) => {
        await eventsProvider.showStackEvents(stackName)
        await commands.executeCommand(commandKey('stack.events.focus'))
    })
}

export function showStackOutputsCommand(outputsProvider: StackOutputsWebviewProvider) {
    return commands.registerCommand(commandKey('stack.outputs.show'), async (stackName: string) => {
        await outputsProvider.showOutputs(stackName)
        await commands.executeCommand(commandKey('stack.outputs.focus'))
    })
}

export function createProjectCommand(uiInterface: CfnInitUiInterface) {
    return commands.registerCommand(commandKey('init.initializeProject'), async () => {
        await uiInterface.promptForCreate()
    })
}

export function addEnvironmentCommand(
    uiInterface: CfnInitUiInterface,
    cfnInit: CfnInitCliCaller,
    environmentManager: CfnEnvironmentManager
) {
    return commands.registerCommand(commandKey('init.addEnvironment'), async () => {
        if (await environmentManager.promptInitializeIfNeeded('Environment Addition')) {
            return
        }

        try {
            const environment = await uiInterface.collectEnvironmentConfig()
            if (!environment) {
                return
            }

            const result = await cfnInit.addEnvironments([environment])

            if (result.success) {
                void window.showInformationMessage(`Environment '${environment.name}' added successfully`)
            } else {
                showErrorMessage(`Failed to add environment: ${result.error}`)
            }
        } catch (error) {
            showErrorMessage(`Error adding environment: ${error}`)
        }
    })
}

export function removeEnvironmentCommand(cfnInit: CfnInitCliCaller, environmentManager: CfnEnvironmentManager) {
    return commands.registerCommand(commandKey('init.removeEnvironment'), async () => {
        if (await environmentManager.promptInitializeIfNeeded('Environment Deletion')) {
            return
        }

        try {
            // TODO: Show quickpick of environments instead of inputting it
            const envName = await getEnvironmentName()
            if (!envName) {
                return
            }

            const confirm = await window.showWarningMessage(`Remove environment '${envName}'?`, 'Remove', 'Cancel')
            if (confirm !== 'Remove') {
                return
            }

            const result = await cfnInit.removeEnvironment(envName)
            if (result.success) {
                void window.showInformationMessage(`Environment '${envName}' removed successfully`)
            } else {
                showErrorMessage(`Failed to remove environment: ${result.error}`)
            }
        } catch (error) {
            showErrorMessage(`Error removing environment: ${error}`)
        }
    })
}

export function addRelatedResourcesCommand(relatedResourcesManager: RelatedResourcesManager) {
    return commands.registerCommand(commandKey('api.addRelatedResources'), async (node?: ResourceTypeNode) => {
        const selectedResourceType = node?.typeName
        await relatedResourcesManager.addRelatedResources(selectedResourceType)
    })
}
