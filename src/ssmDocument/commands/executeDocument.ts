/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import * as vscode from 'vscode'
import { getLogger, Logger } from '../../shared/logger'
import * as telemetry from '../../shared/telemetry/telemetry'
import { DocumentItemNode } from '../explorer/documentItemNode'

export async function executeDocument(node: DocumentItemNode) {
    const logger: Logger = getLogger()

    let result: telemetry.Result = 'Succeeded'

    try {
        await node.executeDocument()
        logger.info(`Opened external link to execute document ${node.documentName} successfully.`)
    } catch (err) {
        result = 'Failed'
        const error = err as Error
        logger.error('Error on executing document: %0', error)
        vscode.window.showErrorMessage(
            localize(
                'AWS.message.error.ssmDocument.executeDocument.execute_failure',
                'Could open external link for document {0}. Please check logs for more details.',
                error.message
            )
        )
    } finally {
        telemetry.recordSsmExecuteDocument({ result: result })
    }
}
