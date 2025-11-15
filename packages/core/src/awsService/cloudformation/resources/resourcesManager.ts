/*!
import { getLogger } from '../../../shared/logger'
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ResourceSelectionResult, ResourceSelector } from '../ui/resourceSelector'
import { ResourceNode } from '../explorer/nodes/resourceNode'
import { LanguageClient } from 'vscode-languageclient/node'
import {
    ListResourcesRequest,
    RefreshResourcesRequest,
    ResourceList,
    ResourceSelection,
    ResourceStackManagementResult,
    ResourceStateParams,
    ResourceStatePurpose,
    ResourceStateRequest,
    ResourceStateResult,
    StackMgmtInfoRequest,
    SearchResourceRequest,
    SearchResourceResult,
} from '../cfn/resourceRequestTypes'

import { showErrorMessage } from '../ui/message'
import { ProgressLocation, SnippetString, window, env, Position, Range } from 'vscode'
import { getLogger } from '../../../shared/logger/logger'
import globals from '../../../shared/extensionGlobals'
import { setContext } from '../../../shared/vscode/setContext'

type ResourcesChangeListener = (resources: ResourceList[]) => void

export class ResourcesManager {
    private resources: Map<string, ResourceList> = new Map()
    private readonly listeners: ResourcesChangeListener[] = []
    private static readonly resourceTypesKey = 'aws.cloudformation.selectedResourceTypes'

    private readonly CopyStackName = 'Copy Stack Name'
    private readonly CopyStackArn = 'Copy Stack Arn'

    constructor(
        private readonly client: LanguageClient,
        private readonly resourceSelector: ResourceSelector
    ) {}

    private get selectedResourceTypes(): string[] {
        return globals.globalState.tryGet<string[]>(ResourcesManager.resourceTypesKey, Object, [])
    }

    private async setSelectedResourceTypes(types: string[]): Promise<void> {
        await globals.globalState.update(ResourcesManager.resourceTypesKey, types)
    }

    getSelectedResourceTypes(): string[] {
        return this.selectedResourceTypes
    }

    async removeResourceType(typeToRemove: string): Promise<void> {
        await globals.globalState.update(
            ResourcesManager.resourceTypesKey,
            this.selectedResourceTypes.filter((type) => type !== typeToRemove)
        )
        this.notifyAllListeners()
    }

    get(): ResourceList[] {
        return Array.from(this.resources.values())
    }

    addListener(listener: ResourcesChangeListener) {
        this.listeners.push(listener)
    }

    async loadResources(): Promise<void> {
        try {
            if (this.selectedResourceTypes.length === 0) {
                this.resources.clear()
                return
            }

            this.resources.clear()

            const response = await this.client.sendRequest(ListResourcesRequest, {
                resources: this.selectedResourceTypes.map((resourceType) => ({ resourceType })),
            })

            for (const resource of response.resources) {
                this.resources.set(resource.typeName, resource)
            }
        } catch (error) {
            getLogger().error(`Failed to load resources: ${error}`)
            this.resources.clear()
        } finally {
            this.notifyAllListeners()
        }
    }

    async loadResourceType(resourceType: string): Promise<void> {
        try {
            const response = await this.client.sendRequest(ListResourcesRequest, {
                resources: [{ resourceType }],
            })

            if (response.resources.length > 0) {
                this.resources.set(resourceType, response.resources[0])
                this.notifyAllListeners()
            }
        } catch (error) {
            getLogger().error(`Failed to load resource type ${resourceType}: ${error}`)
        }
    }

    async loadMoreResources(resourceType: string, nextToken: string): Promise<void> {
        await setContext('aws.cloudformation.loadingResources', true)
        try {
            const response = await this.client.sendRequest(ListResourcesRequest, {
                resources: [{ resourceType, nextToken }],
            })

            if (response.resources.length > 0) {
                this.resources.set(resourceType, response.resources[0])
            }

            this.notifyAllListeners()
        } catch (error) {
            getLogger().error(`Failed to load more resources: ${error}`)
            void window.showErrorMessage(
                `Failed to load more resources: ${error instanceof Error ? error.message : String(error)}`
            )
        } finally {
            await setContext('aws.cloudformation.loadingResources', false)
        }
    }

    refreshAllResources(): void {
        void window.withProgress(
            {
                location: ProgressLocation.Notification,
                title: 'Refreshing All Resources List',
            },
            async () => {
                await setContext('aws.cloudformation.refreshingAllResources', true)
                try {
                    if (this.selectedResourceTypes.length === 0) {
                        return
                    }

                    const response = await this.client.sendRequest(RefreshResourcesRequest, {
                        resources: this.selectedResourceTypes.map((resourceType) => ({ resourceType })),
                    })
                    this.resources.clear()
                    for (const resource of response.resources) {
                        this.resources.set(resource.typeName, resource)
                    }
                } catch (error) {
                    getLogger().error(`Failed to refresh all resources: ${error}`)
                } finally {
                    await setContext('aws.cloudformation.refreshingAllResources', false)
                    this.notifyAllListeners()
                }
            }
        )
    }

    refreshResourceList(resourceType: string): void {
        void window.withProgress(
            {
                location: ProgressLocation.Notification,
                title: `Refreshing ${resourceType} Resources List`,
            },
            async () => {
                await setContext('aws.cloudformation.refreshingResourceList', true)
                try {
                    const response = await this.client.sendRequest(RefreshResourcesRequest, {
                        resources: [{ resourceType }],
                    })

                    const updatedResource = response.resources.find(
                        (r: { typeName: string }) => r.typeName === resourceType
                    )
                    if (updatedResource) {
                        this.resources.set(resourceType, updatedResource)
                    }
                } catch (error) {
                    getLogger().error(`Failed to refresh resource: ${error}`)
                } finally {
                    await setContext('aws.cloudformation.refreshingResourceList', false)
                    this.notifyAllListeners()
                }
            }
        )
    }

    async searchResource(resourceType: string, identifier: string): Promise<SearchResourceResult> {
        try {
            const response = await this.client.sendRequest(SearchResourceRequest, {
                resourceType,
                identifier,
            })

            if (response.found && response.resource) {
                this.resources.set(resourceType, response.resource)
                this.notifyAllListeners()
            }

            return response
        } catch (error) {
            getLogger().error(`Failed to search resource: ${error}`)
            return { found: false }
        }
    }

    async selectResourceTypes(): Promise<void> {
        const selectedTypes = await this.resourceSelector.selectResourceTypes(this.selectedResourceTypes)
        if (selectedTypes !== undefined) {
            await this.setSelectedResourceTypes(selectedTypes)

            // Remove resources that are no longer selected
            const selectedSet = new Set(selectedTypes)
            for (const typeName of this.resources.keys()) {
                if (!selectedSet.has(typeName)) {
                    this.resources.delete(typeName)
                }
            }

            this.notifyAllListeners()
        }
    }

    private async executeResourceStateOperation(
        resourceNodes: ResourceNode[] | undefined,
        purpose: ResourceStatePurpose,
        parentResourceType?: string
    ): Promise<void> {
        const editor = window.activeTextEditor
        if (!editor) {
            showErrorMessage('No active editor')
            return
        }

        const contextKey =
            purpose === ResourceStatePurpose.Import
                ? 'aws.cloudformation.importingResource'
                : 'aws.cloudformation.cloningResource'
        await setContext(contextKey, true)

        try {
            const resourceSelectionsArray = await this.getResourceSelectionArray(resourceNodes)
            if (resourceSelectionsArray.length === 0) {
                return
            }

            const params: ResourceStateParams = {
                textDocument: { uri: editor.document.uri.toString() },
                resourceSelections: resourceSelectionsArray,
                purpose,
                parentResourceType,
            }

            const title =
                purpose === ResourceStatePurpose.Import ? 'Importing Resource State' : 'Cloning Resource State'
            await window.withProgress(
                {
                    location: ProgressLocation.Notification,
                    title,
                    cancellable: false,
                },
                async () => {
                    const result = (await this.client.sendRequest(
                        ResourceStateRequest.method,
                        params
                    )) as ResourceStateResult
                    if (result.warning) {
                        void window.showWarningMessage(result.warning)
                    }
                    await this.applyCompletionSnippet(result)
                    const [successCount, failureCount] = this.getSuccessAndFailureCount(result)
                    this.renderResultMessage(successCount, failureCount, purpose)
                }
            )
        } catch (error) {
            const action = purpose === ResourceStatePurpose.Import ? 'importing' : 'cloning'
            showErrorMessage(
                `Error ${action} resource state: ${error instanceof Error ? error.message : String(error)}`
            )
        } finally {
            await setContext(contextKey, false)
        }
    }

    async importResourceStates(resourceNodes?: ResourceNode[], parentResourceType?: string): Promise<void> {
        await this.executeResourceStateOperation(resourceNodes, ResourceStatePurpose.Import, parentResourceType)
    }

    private getResourcesToImportInput(selections: ResourceSelectionResult[]): ResourceSelection[] {
        // Group selections by resource type
        const resourceSelections = new Map<string, string[]>()
        for (const selection of selections) {
            const identifiers = resourceSelections.get(selection.resourceType) ?? []
            identifiers.push(selection.resourceIdentifier)
            resourceSelections.set(selection.resourceType, identifiers)
        }

        // Convert to ResourceSelection[] format expected by server
        return Array.from(resourceSelections.entries()).map(([resourceType, resourceIdentifiers]) => ({
            resourceType,
            resourceIdentifiers,
        }))
    }

    private async applyCompletionSnippet(result: ResourceStateResult): Promise<void> {
        const { completionItem } = result

        if (!completionItem?.textEdit) {
            getLogger().warn('No completionItem or textEdit in result')
            return
        }

        const editor = window.activeTextEditor
        if (!editor) {
            getLogger().warn('No active editor for snippet insertion')
            return
        }

        try {
            const textEdit = completionItem.textEdit
            if (!textEdit || !('range' in textEdit)) {
                getLogger().warn('No valid textEdit range found')
                return
            }

            const targetLine = textEdit.range.start.line
            await this.ensureLineExists(editor, targetLine)

            const range = new Range(
                new Position(textEdit.range.start.line, textEdit.range.start.character),
                new Position(textEdit.range.end.line, textEdit.range.end.character)
            )

            getLogger().info(
                `Inserting snippet at server-provided position: line ${range.start.line}, char ${range.start.character}`
            )
            await editor.insertSnippet(new SnippetString(textEdit.newText), range)
            getLogger().info('Snippet insertion successful')
        } catch (error) {
            getLogger().error(`Failed to insert snippet: ${error instanceof Error ? error.message : String(error)}`)
            showErrorMessage(`Failed to insert resource: ${error instanceof Error ? error.message : String(error)}`)
        }
    }

    private async ensureLineExists(editor: any, targetLine: number): Promise<void> {
        const document = editor.document
        if (targetLine >= document.lineCount) {
            const linesToAdd = targetLine - document.lineCount + 1
            const lastLine = document.lineAt(document.lineCount - 1)
            const endPosition = lastLine.range.end

            await editor.edit((editBuilder: any) => {
                editBuilder.insert(endPosition, '\n'.repeat(linesToAdd))
            })
        }
    }

    private getSuccessAndFailureCount(result: ResourceStateResult): [number, number] {
        const successCount = Object.values(result.successfulImports ?? {}).reduce(
            (sum: number, ids: string[]) => sum + ids.length,
            0
        ) as number
        const failureCount = Object.values(result.failedImports ?? {}).reduce(
            (sum: number, ids: string[]) => sum + ids.length,
            0
        ) as number
        return [successCount, failureCount]
    }

    async cloneResourceStates(resourceNodes?: ResourceNode[]): Promise<void> {
        await this.executeResourceStateOperation(resourceNodes, ResourceStatePurpose.Clone)
    }

    private async getResourceSelectionArray(resourceNodes?: ResourceNode[]): Promise<ResourceSelection[]> {
        let selections: ResourceSelectionResult[]

        if (resourceNodes?.length) {
            selections = resourceNodes.map((node) => ({
                resourceType: node.resourceType,
                resourceIdentifier: node.resourceIdentifier,
            }))
        } else {
            selections = await this.resourceSelector.selectResources()
        }

        if (selections.length === 0) {
            return []
        }

        return this.getResourcesToImportInput(selections)
    }

    private renderResultMessage(successCount: number, failureCount: number, purpose: ResourceStatePurpose) {
        const action = purpose === ResourceStatePurpose.Import ? 'imported' : 'cloned'

        if (successCount > 0 && failureCount === 0) {
            void window.showInformationMessage(`Successfully ${action} ${successCount} resource(s)`)
        } else if (successCount > 0 && failureCount > 0) {
            void window.showWarningMessage(
                `${action.charAt(0).toUpperCase() + action.slice(1)} ${successCount} resource(s), ${failureCount} failed`
            )
        } else if (failureCount > 0) {
            showErrorMessage(`Failed to ${action.replace('ed', '')} ${failureCount} resource(s)`)
        } else {
            void window.showInformationMessage(`No resources were ${action}`)
        }
    }

    private getResourcesArray(): ResourceList[] {
        return Array.from(this.resources.values())
    }

    private notifyAllListeners(): void {
        for (const listener of this.listeners) {
            listener(this.getResourcesArray())
        }
    }

    reload() {
        this.resources.clear()
        this.notifyAllListeners()
    }

    async getStackManagementInfo(resourceNode?: ResourceNode): Promise<void> {
        let resourceIdentifier: string | undefined

        if (resourceNode?.resourceIdentifier) {
            resourceIdentifier = resourceNode.resourceIdentifier
        } else {
            const selection = await this.resourceSelector.selectSingleResource()
            if (!selection) {
                return
            }
            resourceIdentifier = selection.resourceIdentifier
        }

        await setContext('aws.cloudformation.gettingStackMgmtInfo', true)
        try {
            const result = (await window.withProgress(
                {
                    location: ProgressLocation.SourceControl,
                    title: 'Getting Stack Management Info',
                    cancellable: false,
                },
                async () => {
                    return await this.client.sendRequest(StackMgmtInfoRequest.method, resourceIdentifier)
                }
            )) as ResourceStackManagementResult

            await setContext('aws.cloudformation.gettingStackMgmtInfo', false)

            if (result.managedByStack === true && result.stackName && result.stackId) {
                const action = await window.showInformationMessage(
                    `${result.physicalResourceId} is managed by stack: ${result.stackName}`,
                    this.CopyStackName,
                    this.CopyStackArn
                )

                if (action === this.CopyStackName) {
                    await env.clipboard.writeText(result.stackName)
                    window.setStatusBarMessage('Stack name copied to clipboard', 3000)
                } else if (action === this.CopyStackArn) {
                    await env.clipboard.writeText(result.stackId)
                    window.setStatusBarMessage('Stack ARN copied to clipboard', 3000)
                }
            } else if (result.managedByStack === false) {
                void window.showInformationMessage(`${result.physicalResourceId} is not managed by any stack`)
            } else {
                showErrorMessage(`Failed to determine stack management status: ${result.error ?? 'Unknown error'}`)
            }
        } catch (error) {
            showErrorMessage(
                `Error getting stack management info: ${error instanceof Error ? error.message : String(error)}`
            )
            await setContext('aws.cloudformation.gettingStackMgmtInfo', false)
        }
    }
}
