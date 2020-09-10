/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import { SSM } from 'aws-sdk'
import * as vscode from 'vscode'
import { DocumentItemNode } from '../explorer/documentItemNode'
import { AwsContext } from '../../shared/awsContext'
import { getLogger, Logger } from '../../shared/logger'
import * as telemetry from '../../shared/telemetry/telemetry'
import * as picker from '../../shared/ui/picker'

export interface SsmDocumentQuickPickItem {
    label: string
    description: string
}

export async function openDocumentItem(node: DocumentItemNode, awsContext: AwsContext) {
    const logger: Logger = getLogger()

    let result: telemetry.Result = 'Succeeded'

    let documentVersion: string | undefined = undefined
    let documentFormat: string | undefined = undefined

    if (node.documentOwner === awsContext.getCredentialAccountId()) {
        const versions = await node.listSchemaVersion()
        documentVersion = await promptUserforDocumentVersion(versions)
    }

    // Currently only JSON/YAML formats are supported
    documentFormat = await promptUserforDocumentFormat(['JSON', 'YAML'])

    try {
        const rawContent = await node.getDocumentContent(documentVersion, documentFormat)
        const textDocument = await vscode.workspace.openTextDocument({
            content: rawContent.Content,
            language: `ssm-${rawContent.DocumentFormat!.toLowerCase()}`,
        })
        vscode.window.showTextDocument(textDocument)
    } catch (err) {
        result = 'Failed'
        const error = err as Error
        vscode.window.showErrorMessage(
            localize(
                'AWS.message.error.ssmDocumet.openDocument.could_not_open',
                'Could not fetch and display document {0} contents',
                node.documentName
            )
        )
        logger.error('Error on openning document: %0', error)
    } finally {
        telemetry.recordSsmOpenDocument({ result: result })
    }
}

async function promptUserforDocumentFormat(formats: string[]): Promise<string | undefined> {
    // Prompt user to pick document format
    const quickPickItems: SsmDocumentQuickPickItem[] = formats.map(format => {
        return {
            label: format,
            description: `Open document with format ${format}`,
        }
    })

    const formatPick = picker.createQuickPick({
        options: {
            ignoreFocusOut: true,
            title: localize('AWS.message.prompt.selectSsmDocumentFormat.placeholder', 'Select a document format'),
        },
        buttons: [vscode.QuickInputButtons.Back],
        items: quickPickItems,
    })

    const formatChoices = await picker.promptUser({
        picker: formatPick,
        onDidTriggerButton: (_, resolve) => {
            resolve(undefined)
        },
    })

    const formatSelection = picker.verifySinglePickerOutput(formatChoices)

    // User pressed escape and didn't select a template
    if (formatSelection === undefined) {
        return undefined
    }

    return formatSelection.label
}

async function promptUserforDocumentVersion(versions: SSM.Types.DocumentVersionInfo[]): Promise<string | undefined> {
    // Prompt user to pick document version
    const quickPickItems: SsmDocumentQuickPickItem[] = []
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
                title: localize('AWS.message.prompt.selectSsmDocumentVersion.placeholder', 'Select a document version'),
            },
            buttons: [vscode.QuickInputButtons.Back],
            items: quickPickItems,
        })

        const versionChoices = await picker.promptUser({
            picker: versionPick,
            onDidTriggerButton: (_, resolve) => {
                resolve(undefined)
            },
        })

        const versionSelection = picker.verifySinglePickerOutput(versionChoices)

        // User pressed escape and didn't select a template
        if (versionSelection === undefined) {
            return undefined
        }

        return versionSelection.label
    }
}
