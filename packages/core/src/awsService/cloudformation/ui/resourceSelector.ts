/*!
import { getLogger } from '../../../shared/logger'
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { window } from 'vscode'
import { LanguageClient } from 'vscode-languageclient/node'
import { ResourceTypesRequest, ListResourcesRequest, ResourceList } from '../cfn/resourceRequestTypes'
import { getLogger } from '../../../shared/logger/logger'

export interface ResourceSelectionResult {
    resourceType: string
    resourceIdentifier: string
}

export class ResourceSelector {
    constructor(private client: LanguageClient) {}

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

    async selectResources(multiSelect = true, preSelectedTypes?: string[]): Promise<ResourceSelectionResult[]> {
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
                const resourceIdentifiers = await this.getResourceIdentifiers(resourceType)
                if (resourceIdentifiers.length === 0) {
                    void window.showWarningMessage(`No resources found for type: ${resourceType}`)
                    continue
                }

                const result = await window.showQuickPick(resourceIdentifiers, {
                    canPickMany: multiSelect,
                    placeHolder: `Select ${resourceType} identifiers`,
                    title: `Select from all ${resourceType} Resources`,
                })

                if (!result) {
                    continue
                }

                const identifiers = Array.isArray(result) ? result : [result]
                for (const identifier of identifiers) {
                    allSelections.push({ resourceType, resourceIdentifier: identifier })
                }
            }

            return allSelections
        } catch (error) {
            void window.showErrorMessage('Failed to select resources')
            return []
        }
    }

    async selectSingleResource(): Promise<ResourceSelectionResult | undefined> {
        const result = await this.selectResources(false)
        return result[0]
    }

    private async getResourceIdentifiers(resourceType: string, cachedResources?: ResourceList[]): Promise<string[]> {
        // First try to use cached resources from CfnPanel
        if (cachedResources) {
            const cachedResource = cachedResources.find((r) => r.typeName === resourceType)
            if (cachedResource) {
                return cachedResource.resourceIdentifiers
            }
        }

        // If not cached, fetch from server
        try {
            const resourcesResponse = await this.client.sendRequest(ListResourcesRequest, {
                resources: [{ resourceType }],
            })

            const resources = resourcesResponse.resources.find((r: { typeName: string }) => r.typeName === resourceType)
            return resources?.resourceIdentifiers ?? []
        } catch (error) {
            getLogger().error(`Failed to get resources for type ${resourceType}:`, error)
            return []
        }
    }
}
