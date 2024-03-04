/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
import { ResourceCodeLensProvider } from '../shared/codelens/resourceCodeLensProvider'
import { configureResources } from './commands/configure'
import { copyIdentifier } from './commands/copyIdentifier'
import { deleteResource } from './commands/deleteResource'
import { getDiagnostics, openResource } from './commands/openResource'
import { saveResource } from './commands/saveResource'
import { ResourcesNode } from './explorer/nodes/resourcesNode'
import { ResourceNode } from './explorer/nodes/resourceNode'
import { ResourceTypeNode } from './explorer/nodes/resourceTypeNode'
import { resourceFileGlobPattern } from './awsResourceManager'
import { Commands } from '../shared/vscode/commands2'
import globals from '../shared/extensionGlobals'
import { openUrl } from '../shared/utilities/vsCodeUtils'

const localize = nls.loadMessageBundle()

/**
 * Activates Resources components.
 */
export async function activate(context: vscode.ExtensionContext): Promise<void> {
    const resourceDiagnostics = vscode.languages.createDiagnosticCollection(
        localize('AWS.explorerNode.resources.label', 'Resources')
    )
    const resourceManager = globals.resourceManager

    context.subscriptions.push(
        vscode.workspace.registerTextDocumentContentProvider('awsResource', new VirtualDocumentProvider()),
        Commands.register('aws.resources.openResourcePreview', async (node: ResourceNode) => {
            await openResource({
                source: node,
                preview: true,
                resourceManager,
                diagnostics: resourceDiagnostics,
            })
        }),
        Commands.register('aws.resources.copyIdentifier', async (node: ResourceNode) => {
            await copyIdentifier(node.parent.typeName, node.identifier)
        }),
        Commands.register('aws.resources.configure', async (node: ResourcesNode) => {
            if (await configureResources()) {
                node.refresh()
            }
        }),
        Commands.register('aws.resources.createResource', async (node: ResourceTypeNode) => {
            await resourceManager.new(node)
        }),
        Commands.register('aws.resources.deleteResource', async (node: ResourceNode) => {
            if (await deleteResource(node.parent.cloudControl, node.parent.typeName, node.identifier)) {
                await resourceManager.close(resourceManager.toUri(node)!)
                node.parent.clearChildren()
                node.parent.refresh()
            }
        }),
        Commands.register('aws.resources.updateResource', async (node: ResourceNode) => {
            await openResource({
                source: node,
                preview: false,
                resourceManager,
                diagnostics: resourceDiagnostics,
            })
        }),
        Commands.register('aws.resources.updateResourceInline', async (uri: vscode.Uri) => {
            await openResource({
                source: uri,
                preview: false,
                resourceManager,
                diagnostics: resourceDiagnostics,
            })
        }),
        vscode.workspace.onDidSaveTextDocument(async (doc: vscode.TextDocument) => {
            return await saveResource(doc, resourceManager, resourceDiagnostics)
        }),
        Commands.register('aws.resources.saveResource', async (uri: vscode.Uri) => {
            await vscode.window.showTextDocument(uri)
            await vscode.commands.executeCommand('workbench.action.files.save')
        }),
        Commands.register('aws.resources.closeResource', async (uri: vscode.Uri) => {
            if (resourceManager.fromUri(uri) instanceof ResourceNode) {
                await openResource({
                    source: uri,
                    preview: true,
                    resourceManager,
                    diagnostics: resourceDiagnostics,
                })
                resourceDiagnostics.delete(uri)
            } else {
                await resourceManager.close(uri)
            }
        }),
        Commands.register('aws.resources.viewDocs', async (node: ResourceTypeNode) => {
            await openUrl(vscode.Uri.parse(node.metadata.documentation))
        }),
        vscode.workspace.onDidChangeTextDocument(textDocumentEvent => {
            if (resourceDiagnostics.has(textDocumentEvent.document.uri)) {
                let diagnostics: vscode.Diagnostic[] = []
                const resource = resourceManager.fromUri(textDocumentEvent.document.uri)
                if (resource instanceof ResourceNode) {
                    const schema = resourceManager.getSchema(resource.parent.typeName)
                    if (schema) {
                        diagnostics = getDiagnostics(schema, textDocumentEvent.document)
                    }
                }
                resourceDiagnostics.set(textDocumentEvent.document.uri, diagnostics)
            }
        }),
        vscode.workspace.onDidCloseTextDocument(closeDocumentEvent => {
            return resourceManager.close(closeDocumentEvent.uri, true)
        }),
        vscode.languages.registerCodeLensProvider(
            {
                language: 'json',
                scheme: 'file',
                pattern: resourceFileGlobPattern,
            },
            new ResourceCodeLensProvider(resourceManager)
        )
    )
}

export class VirtualDocumentProvider implements vscode.TextDocumentContentProvider {
    provideTextDocumentContent(uri: vscode.Uri): string {
        return uri.query
    }
}
