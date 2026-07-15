/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { window } from 'vscode'
import { LanguageClient, ResponseError } from 'vscode-languageclient/node'
import { ErrorCodes } from 'vscode-jsonrpc'
import {
    getAuthoredResourceTypes,
    getAuthoredResourceTypesV2,
    getRelatedResourceTypes,
} from '../relatedResources/relatedResourcesApi'
import { AuthoredResource } from '../relatedResources/relatedResourcesProtocol'

export class RelatedResourceSelector {
    constructor(private client: LanguageClient) {}

    async selectAuthoredResourceType(templateUri: string): Promise<{ logicalId: string; type: string } | undefined> {
        const authoredResources = await this.getAuthoredResources(templateUri)
        if (authoredResources.length === 0) {
            void window.showInformationMessage('No resources found in the current template')
            return undefined
        }

        // group resources by type
        const resourcesByType = new Map<string, AuthoredResource[]>()
        for (const resource of authoredResources) {
            const resources = resourcesByType.get(resource.type) || []
            resources.push(resource)
            resourcesByType.set(resource.type, resources)
        }

        const uniqueTypes = [...resourcesByType.keys()]
        const selectedType = await window.showQuickPick(uniqueTypes, {
            placeHolder: 'Select an existing resource type from your template',
            canPickMany: false,
        })

        if (!selectedType) {
            return undefined
        }

        const resourcesOfType = resourcesByType.get(selectedType)
        if (!resourcesOfType) {
            return undefined
        }

        // if multiple resources of this type exist, let user choose which one
        if (resourcesOfType.length > 1) {
            const logicalIdItems = resourcesOfType.map((resource) => ({
                label: resource.logicalId,
                logicalId: resource.logicalId,
            }))

            const selectedLogicalId = await window.showQuickPick(logicalIdItems, {
                placeHolder: `Select which ${selectedType} to use`,
                canPickMany: false,
            })

            if (!selectedLogicalId) {
                return undefined
            }

            return { logicalId: selectedLogicalId.logicalId, type: selectedType }
        }

        return { logicalId: resourcesOfType[0].logicalId, type: selectedType }
    }

    /**
     * Fetches authored resources, falling back to v1 endpoint for older servers.
     */
    private async getAuthoredResources(templateUri: string): Promise<AuthoredResource[]> {
        try {
            return await getAuthoredResourceTypesV2(this.client, templateUri)
        } catch (error) {
            // Fall back to v1 only if the server doesn't support v2 (method not found)
            if (error instanceof ResponseError && error.code === ErrorCodes.MethodNotFound) {
                const types = await getAuthoredResourceTypes(this.client, templateUri)
                return types.map((type, index) => ({ logicalId: `Resource${index + 1}`, type }))
            }
            throw error
        }
    }

    async promptCreateOrImport(): Promise<'create' | 'import' | undefined> {
        const action = await window.showQuickPick(['Create new', 'Import existing'], {
            placeHolder: 'How would you like to add related resource types?',
            canPickMany: false,
        })

        if (!action) {
            return undefined
        }

        return action === 'Create new' ? 'create' : 'import'
    }

    async selectRelatedResourceTypes(selectedResourceType: string): Promise<string[] | undefined> {
        const relatedTypes = await getRelatedResourceTypes(this.client, { parentResourceType: selectedResourceType })

        if (relatedTypes.length === 0) {
            void window.showInformationMessage(`No related resources found for ${selectedResourceType}`)
            return undefined
        }

        return window.showQuickPick(relatedTypes, {
            placeHolder: 'Select related resource types',
            canPickMany: true,
        })
    }
}
