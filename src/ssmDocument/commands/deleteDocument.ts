/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import * as vscode from 'vscode'
import { getLogger, Logger } from '../../shared/logger'
import { DocumentItemNodeWriteable } from '../explorer/documentItemNodeWriteable'
import { RegistryItemNode } from '../explorer/registryItemNode'
import { showConfirmationMessage } from '../util/util'
import * as localizedText from '../../shared/localizedText'
import { showViewLogsMessage } from '../../shared/utilities/messages'
import { telemetry } from '../../shared/telemetry/telemetry'
import { Result } from '../../shared/telemetry/telemetry'

export async function deleteDocument(node: DocumentItemNodeWriteable) {
    const logger: Logger = getLogger()

    let result: Result = 'Succeeded'
    const isConfirmed = await showConfirmationMessage({
        prompt: localize(
            'AWS.ssmDocument.deleteDocument.prompt',
            'Are you sure you want to delete document {0}?',
            node.documentName
        ),
        confirm: localizedText.localizedDelete,
        cancel: localizedText.cancel,
    })
    if (!isConfirmed) {
        logger.info('DeleteDocument cancelled')
        telemetry.ssm_deleteDocument.emit({ result: 'Cancelled' })
        return
    }

    try {
        const deleteDocumentResult = await node.deleteDocument()
        if (!deleteDocumentResult) {
            result = 'Failed'
            logger.error(`Delete document failed: Empty document name`)
            void vscode.window.showErrorMessage(
                localize(
                    'AWS.message.info.ssmDocument.deleteDocument.failed.empty_document_name',
                    'Delete document failed: Empty document name'
                )
            )
        } else {
            logger.info(`Deleted Systems Manager Document: ${node.documentName}`)
            void vscode.window.showInformationMessage(
                localize(
                    'AWS.message.info.ssmDocument.deleteDocument.delete_success',
                    'Deleted document: {0}',
                    node.documentName
                )
            )
            await refreshNode(node.parent)
        }
    } catch (err) {
        result = 'Failed'
        const error = err as Error
        logger.error('Error on deleting document: %0', error)
        void showViewLogsMessage(
            localize(
                'AWS.message.error.ssmDocument.deleteDocument.could_not_delete',
                'Could not delete document {0}.',
                error.message
            )
        )
    } finally {
        telemetry.ssm_deleteDocument.emit({ result: result })
    }
}

async function refreshNode(node: RegistryItemNode): Promise<void> {
    return vscode.commands.executeCommand('aws.refreshAwsExplorerNode', node)
}
