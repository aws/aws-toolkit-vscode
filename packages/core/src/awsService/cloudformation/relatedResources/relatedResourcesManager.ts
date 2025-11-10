/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Position, Range, TextEdit, TextEditorRevealType, Uri, window, workspace, WorkspaceEdit } from 'vscode'
import { LanguageClient } from 'vscode-languageclient/node'
import { RelatedResourceSelector } from '../ui/relatedResourceSelector'
import { ResourceSelector } from '../ui/resourceSelector'
import { insertRelatedResources } from './relatedResourcesApi'
import { RelatedResourcesCodeAction } from './relatedResourcesProtocol'
import { showErrorMessage } from '../ui/message'
import { ResourceNode } from '../explorer/nodes/resourceNode'

export class RelatedResourcesManager {
    constructor(
        private client: LanguageClient,
        private selector: RelatedResourceSelector,
        private resourceSelector: ResourceSelector,
        private importResourceStates: (resourceNodes: ResourceNode[], parentResourceType?: string) => Promise<void>
    ) {}

    async addRelatedResources(preSelectedResourceType?: string): Promise<void> {
        const activeEditor = window.activeTextEditor
        if (!activeEditor) {
            void window.showErrorMessage('No template file opened')
            return
        }

        try {
            const templateUri = activeEditor.document.uri.toString()

            const selectedParentResourceType =
                preSelectedResourceType || (await this.selector.selectAuthoredResourceType(templateUri))
            if (!selectedParentResourceType) {
                return
            }

            const selectedRelatedTypes = await this.selector.selectRelatedResourceTypes(selectedParentResourceType)
            if (!selectedRelatedTypes || selectedRelatedTypes.length === 0) {
                return
            }

            const action = await this.selector.promptCreateOrImport()
            if (!action) {
                return
            }

            if (action === 'create') {
                await this.createRelatedResources(templateUri, selectedParentResourceType, selectedRelatedTypes)
            } else {
                await this.importRelatedResources(selectedRelatedTypes, selectedParentResourceType)
            }
        } catch (error) {
            showErrorMessage(
                `Error adding related resources: ${error instanceof Error ? error.message : String(error)}`
            )
        }
    }

    private async createRelatedResources(
        templateUri: string,
        parentResourceType: string,
        relatedResourceTypes: string[]
    ): Promise<void> {
        const result = await insertRelatedResources(this.client, {
            templateUri,
            relatedResourceTypes,
            parentResourceType,
        })

        await this.applyCodeAction(result)

        const activeEditor = window.activeTextEditor
        if (activeEditor && result.data?.scrollToPosition) {
            const position = new Position(result.data.scrollToPosition.line, result.data.scrollToPosition.character)
            const revealRange = new Range(
                new Position(Math.max(0, position.line - 2), 0),
                new Position(position.line + 8, 0)
            )
            activeEditor.revealRange(revealRange, TextEditorRevealType.InCenter)
        }

        void window.showInformationMessage(`Added ${relatedResourceTypes.length} related resources`)
    }

    private async applyCodeAction(codeAction: RelatedResourcesCodeAction): Promise<void> {
        if (codeAction.edit?.changes) {
            const workspaceEdit = new WorkspaceEdit()

            for (const [uri, textEdits] of Object.entries(codeAction.edit.changes)) {
                const docUri = Uri.parse(uri)
                const docEdits = textEdits.map((edit) => {
                    const range = new Range(
                        new Position(edit.range.start.line, edit.range.start.character),
                        new Position(edit.range.end.line, edit.range.end.character)
                    )
                    return new TextEdit(range, edit.newText)
                })
                workspaceEdit.set(docUri, docEdits)
            }

            await workspace.applyEdit(workspaceEdit)
        }
    }

    private async importRelatedResources(
        relatedResourceTypes: string[],
        selectedParentResourceType: string
    ): Promise<void> {
        const selections = await this.resourceSelector.selectResources(true, relatedResourceTypes)
        if (selections.length === 0) {
            return
        }

        const resourceNodes = selections.map((selection) => ({
            resourceType: selection.resourceType,
            resourceIdentifier: selection.resourceIdentifier,
        })) as ResourceNode[]

        await this.importResourceStates(resourceNodes, selectedParentResourceType)
    }
}
