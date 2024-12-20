/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import * as vscode from 'vscode'
import { getLogger, Logger } from '../../shared/logger'
import { Result } from '../../shared/telemetry/telemetry'
import { getTabSizeSetting } from '../../shared/utilities/editorUtilities'
import { SchemaItemNode } from '../explorer/schemaItemNode'
import { telemetry } from '../../shared/telemetry/telemetry'

export async function viewSchemaItem(node: SchemaItemNode) {
    const logger: Logger = getLogger()

    let viewResult: Result = 'Succeeded'
    try {
        const rawSchemaContent = await node.getSchemaContent()
        await showSchemaContent(rawSchemaContent)
    } catch (err) {
        viewResult = 'Failed'
        const error = err as Error
        void vscode.window.showErrorMessage(
            localize(
                'AWS.message.error.schemas.viewSchema.could_not_open',
                'Could not fetch and display schema {0} contents',
                node.schemaName
            )
        )
        logger.error('Error on schema preview: %s', error)
    } finally {
        telemetry.schemas_view.emit({ result: viewResult })
    }
}

export function schemaFormatter(rawSchemaContent: string, tabSize: number = getTabSizeSetting()): string {
    const prettySchemaContent = JSON.stringify(JSON.parse(rawSchemaContent), undefined, tabSize)

    return prettySchemaContent
}

export async function showSchemaContent(
    rawSchemaContent: string,
    tabSize: number = getTabSizeSetting()
): Promise<void> {
    const prettySchemaContent = schemaFormatter(rawSchemaContent, tabSize)
    const newDoc = await vscode.workspace.openTextDocument({
        language: 'json',
    })
    const editor = await vscode.window.showTextDocument(newDoc, vscode.ViewColumn.One, false)
    await editor.edit((edit) => edit.insert(new vscode.Position(/* line*/ 0, /* character*/ 0), prettySchemaContent))
}
