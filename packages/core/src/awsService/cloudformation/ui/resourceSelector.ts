/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { window } from 'vscode'
import { LanguageClient } from 'vscode-languageclient/node'
import {
    ResourceTypesRequest,
    ListResourcesRequest,
    ResourceList,
    SearchResourceResult,
} from '../resources/resourceRequestTypes'
import { handleLspError } from '../utils/onlineErrorHandler'
import { getLogger } from '../../../shared/logger/logger'

export interface ResourceSelectionResult {
    resourceType: string
    resourceIdentifier: string
}

export interface ResourceOperations {
    getCached: (resourceType: string) => ResourceList | undefined
    loadMore: (resourceType: string, nextToken: string) => Promise<void>
    search: (resourceType: string, identifier: string) => Promise<SearchResourceResult>
}

export class ResourceSelector {
    public refreshCallback?: () => void

    constructor(private client: LanguageClient) {}

    setRefreshCallback(callback: () => void): void {
        this.refreshCallback = callback
    }

    async selectResourceTypes(selectedTypes: string[] = [], multiSelect = true): Promise<string[] | undefined> {
        try {
            const response = await this.client.sendRequest(ResourceTypesRequest, {})
            const availableTypes = response.resourceTypes

            if (availableTypes.length === 0) {
                void window.showWarningMessage('No resource types available')
                return undefined
            }

            const quickPickItems = availableTypes.map((type: string) => ({
                label: type,
                picked: selectedTypes.includes(type),
            }))

            const result = await window.showQuickPick(quickPickItems, {
                canPickMany: multiSelect,
                placeHolder: 'Select resource types',
                title: 'Select Resource Types',
            })

            if (!result) {
                return undefined
            }

            if (Array.isArray(result)) {
                return result.map((item: { label: string }) => item.label)
            }
            return [(result as { label: string }).label]
        } catch (error) {
            getLogger().error(`Failed to get resource types: ${error}`)
            void window.showErrorMessage('Failed to get available resource types')
            return undefined
        }
    }

    async selectResources(
        multiSelect = true,
        preSelectedTypes?: string[],
        resourceOperations?: ResourceOperations
    ): Promise<ResourceSelectionResult[]> {
        try {
            let selectedTypes: string[]

            if (preSelectedTypes && preSelectedTypes.length > 0) {
                selectedTypes = preSelectedTypes
            } else {
                const types = await this.selectResourceTypes([], multiSelect)
                if (!types || types.length === 0) {
                    return []
                }
                selectedTypes = types
            }

            const allSelections: ResourceSelectionResult[] = []

            for (const resourceType of selectedTypes) {
                const selection = await this.selectResourcesForType(resourceType, multiSelect, resourceOperations)
                allSelections.push(...selection)
            }

            return allSelections
        } catch (error) {
            await handleLspError(error, 'Error selecting resources')
            return []
        }
    }

    private async selectResourcesForType(
        resourceType: string,
        multiSelect: boolean,
        resourceOperations?: ResourceOperations
    ): Promise<ResourceSelectionResult[]> {
        let resourceList = resourceOperations?.getCached(resourceType)

        if (!resourceList) {
            resourceList = await this.fetchResourceList(resourceType)
        }

        if (!resourceList || resourceList.resourceIdentifiers.length === 0) {
            void window.showWarningMessage(`No resources found for type: ${resourceType}`)
            return []
        }

        while (resourceList.nextToken && resourceOperations) {
            const action = await this.showLoadMoreMenu(resourceType, resourceList.resourceIdentifiers.length)

            if (action === 'load') {
                await resourceOperations.loadMore(resourceType, resourceList.nextToken)
                this.refreshCallback?.()
                const updatedList = resourceOperations.getCached(resourceType)
                if (!updatedList) {
                    break
                }
                resourceList = updatedList
            } else if (action === 'search') {
                const identifier = await window.showInputBox({
                    prompt: `Enter ${resourceType} identifier`,
                    placeHolder: 'Resource identifier must match exactly',
                })

                if (!identifier) {
                    return []
                }

                const result = await resourceOperations.search(resourceType, identifier)
                this.refreshCallback?.()

                if (!result.found) {
                    void window.showErrorMessage(
                        `${resourceType} with identifier '${identifier}' was not found. The identifier must match exactly.`
                    )
                    return []
                }

                return [{ resourceType, resourceIdentifier: identifier }]
            } else if (action === 'select') {
                break
            } else {
                return []
            }
        }

        const result = await window.showQuickPick(resourceList.resourceIdentifiers, {
            canPickMany: multiSelect,
            placeHolder: `Select ${resourceType} identifiers`,
            title: `Select ${resourceType} Resources`,
        })

        if (!result) {
            return []
        }

        const identifiers = Array.isArray(result) ? result : [result]
        return identifiers.map((identifier) => ({ resourceType, resourceIdentifier: identifier }))
    }

    private async showLoadMoreMenu(resourceType: string, loadedCount: number): Promise<string | undefined> {
        const result = await window.showQuickPick(
            [
                { label: `Load more resources (${loadedCount} currently loaded)`, value: 'load' },
                { label: 'Search by identifier', value: 'search' },
                { label: `Select from loaded resources (${loadedCount} available)`, value: 'select' },
            ],
            {
                placeHolder: `Choose how to select ${resourceType} resources`,
                title: resourceType,
            }
        )

        return result?.value
    }

    private async fetchResourceList(resourceType: string): Promise<ResourceList | undefined> {
        const response = await this.client.sendRequest(ListResourcesRequest, {
            resources: [{ resourceType }],
        })

        return response.resources.find((r: { typeName: string }) => r.typeName === resourceType)
    }

    async selectSingleResource(resourceOperations?: ResourceOperations): Promise<ResourceSelectionResult | undefined> {
        const result = await this.selectResources(false, undefined, resourceOperations)
        return result[0]
    }
}
