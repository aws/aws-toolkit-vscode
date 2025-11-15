/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { window } from 'vscode'
import { LanguageClient } from 'vscode-languageclient/node'
import { getAuthoredResourceTypes, getRelatedResourceTypes } from '../relatedResources/relatedResourcesApi'

export class RelatedResourceSelector {
    constructor(private client: LanguageClient) {}

    async selectAuthoredResourceType(templateUri: string): Promise<string | undefined> {
        const resourceTypes = await getAuthoredResourceTypes(this.client, templateUri)
        if (resourceTypes.length === 0) {
            void window.showInformationMessage('No resources found in the current template')
            return undefined
        }

        return window.showQuickPick(resourceTypes, {
            placeHolder: 'Select an existing resource type from your template',
            canPickMany: false,
        })
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
