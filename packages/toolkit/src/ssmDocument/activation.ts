/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { activate as activateSSMLanguageServer } from './ssm/ssmClient'
import { AwsContext } from '../shared/awsContext'

import { createSsmDocumentFromTemplate } from './commands/createDocumentFromTemplate'
import { publishSSMDocument } from './commands/publishDocument'
import { RegionProvider } from '../shared/regions/regionProvider'
import { openDocumentItem, openDocumentItemJson, openDocumentItemYaml } from './commands/openDocumentItem'
import { DocumentItemNode } from './explorer/documentItemNode'
import { deleteDocument } from './commands/deleteDocument'
import { DocumentItemNodeWriteable } from './explorer/documentItemNodeWriteable'
import { updateDocumentVersion } from './commands/updateDocumentVersion'
import { Commands } from '../shared/vscode/commands2'

// Activate SSM Document related functionality for the extension.
export async function activate(
    extensionContext: vscode.ExtensionContext,
    awsContext: AwsContext,
    regionProvider: RegionProvider,
    outputChannel: vscode.OutputChannel
): Promise<void> {
    await registerSsmDocumentCommands(extensionContext, awsContext, regionProvider, outputChannel)
    await activateSSMLanguageServer(extensionContext)
}

async function registerSsmDocumentCommands(
    extensionContext: vscode.ExtensionContext,
    awsContext: AwsContext,
    regionProvider: RegionProvider,
    outputChannel: vscode.OutputChannel
): Promise<void> {
    extensionContext.subscriptions.push(
        Commands.register('aws.ssmDocument.createLocalDocument', async () => {
            await createSsmDocumentFromTemplate(extensionContext)
        }),
        Commands.register('aws.ssmDocument.deleteDocument', async (node: DocumentItemNodeWriteable) => {
            await deleteDocument(node)
        }),
        Commands.register('aws.ssmDocument.openLocalDocument', async (node: DocumentItemNode) => {
            await openDocumentItem(node, awsContext)
        }),
        Commands.register('aws.ssmDocument.openLocalDocumentJson', async (node: DocumentItemNode) => {
            await openDocumentItemJson(node, awsContext)
        }),
        Commands.register('aws.ssmDocument.openLocalDocumentYaml', async (node: DocumentItemNode) => {
            await openDocumentItemYaml(node, awsContext)
        }),
        Commands.register('aws.ssmDocument.publishDocument', async () => {
            await publishSSMDocument()
        }),
        Commands.register('aws.ssmDocument.updateDocumentVersion', async (node: DocumentItemNodeWriteable) => {
            await updateDocumentVersion(node, awsContext)
        })
    )
}
