/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import { SSM } from 'aws-sdk'
import * as vscode from 'vscode'
import { DocumentItemNode } from '../explorer/documentItemNode'
import { AwsContext } from '../../shared/awsContext'
import { getLogger, Logger } from '../../shared/logger'
import * as picker from '../../shared/ui/picker'
import { showViewLogsMessage } from '../../shared/utilities/messages'
import { telemetry } from '../../shared/telemetry/telemetry'
import { Result } from '../../shared/telemetry/telemetry'

export async function openDocumentItem(node: DocumentItemNode, awsContext: AwsContext, format?: string) {
    const logger: Logger = getLogger()

    let result: Result = 'Succeeded'

    let documentVersion: string | undefined = undefined

    if (node.documentOwner === awsContext.getCredentialAccountId()) {
        const versions = await node.listSchemaVersion()
        if (versions.length > 1) {
            documentVersion = await promptUserforDocumentVersion(versions)
            if (documentVersion === undefined) {
                // user pressed escape and didn't select a version
                return
            }
        }
    }

    try {
        const rawContent = await node.getDocumentContent(documentVersion, format)
        const textDocument = await vscode.workspace.openTextDocument({
            content: rawContent.Content,
            language: `ssm-${rawContent.DocumentFormat!.toLowerCase()}`,
        })
        await vscode.window.showTextDocument(textDocument)
    } catch (err) {
        result = 'Failed'
        const error = err as Error
        logger.error('Error on opening document: %0', error)
        void showViewLogsMessage(
            localize(
                'AWS.message.error.ssmDocument.openDocument.could_not_open',
                'Could not fetch document: {0}',
                node.documentName
            )
        )
    } finally {
        telemetry.ssm_openDocument.emit({ result: result })
    }
}

export async function openDocumentItemJson(node: DocumentItemNode, awsContext: AwsContext) {
    await openDocumentItem(node, awsContext, 'JSON')
}

export async function openDocumentItemYaml(node: DocumentItemNode, awsContext: AwsContext) {
    await openDocumentItem(node, awsContext, 'YAML')
}

async function promptUserforDocumentVersion(versions: SSM.Types.DocumentVersionInfo[]): Promise<string | undefined> {
    // Prompt user to pick document version
    const quickPickItems: vscode.QuickPickItem[] = []
    versions.forEach(version => {
        if (version.DocumentVersion) {
            quickPickItems.push({
                label: version.DocumentVersion,
                description: `${version.IsDefaultVersion ? 'Default' : ''}`,
            })
        }
    })

    if (quickPickItems.length > 1) {
        const versionPick = picker.createQuickPick({
            options: {
                ignoreFocusOut: true,
                title: localize(
                    'AWS.message.prompt.selectSsmDocumentVersion.placeholder',
                    'Select a document version to download'
                ),
            },
            items: quickPickItems,
        })

        const versionChoices = await picker.promptUser({
            picker: versionPick,
        })

        const versionSelection = picker.verifySinglePickerOutput(versionChoices)

        // User pressed escape and didn't select a template
        return versionSelection?.label
    }
}
