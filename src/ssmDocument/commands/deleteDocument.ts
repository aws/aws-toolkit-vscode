/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import * as vscode from 'vscode'
import { getLogger, Logger } from '../../shared/logger'
import * as telemetry from '../../shared/telemetry/telemetry'
import { showConfirmationMessage } from '../util/util'
import { Window } from '../../shared/vscode/window'
import { DocumentItemNodeWriteable } from '../explorer/documentItemNodeWriteable'

export async function deleteDocument(node: DocumentItemNodeWriteable, window = Window.vscode()) {
    const logger: Logger = getLogger()

    let result: telemetry.Result = 'Succeeded'
    const isConfirmed = await showConfirmationMessage(
        {
            prompt: localize(
                'AWS.ssmDocument.deleteDocument.prompt',
                'Are you sure you want to delete document {0}?',
                node.documentName
            ),
            confirm: localize('AWS.ssmDocument.deleteDocument.confirm', 'Delete'),
            cancel: localize('AWS.ssmDocument.deleteDocument.cancel', 'Cancel'),
        },
        window
    )
    if (!isConfirmed) {
        getLogger().info('DeleteDocument cancelled')
        telemetry.recordSsmDeleteDocument({ result: 'Cancelled' })
        return
    }

    try {
        await node.deleteDocument()
        logger.info(`Deleted Systems Manager Document successfully ${node.documentName}`)
        vscode.window.showInformationMessage(
            localize(
                'AWS.message.info.ssmDocument.deleteDocument.delete_success',
                'Deleted document {0} successfully.',
                node.documentName
            )
        )
    } catch (err) {
        result = 'Failed'
        const error = err as Error
        logger.error('Error on deleting document: %0', error)
        vscode.window.showErrorMessage(
            localize(
                'AWS.message.error.ssmDocument.deleteDocument.could_not_delete',
                'Could not delete document {0}. Please check logs for more details.',
                error.message
            )
        )
    } finally {
        telemetry.recordSsmDeleteDocument({ result: result })
    }
}
