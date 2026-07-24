/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { isTreeNode } from '../../../shared/treeview/resourceTreeDataProvider'
import { unboxTreeNode } from '../../../shared/treeview/utils'

interface TemplateTarget {
    templateFile: string
    templateOffset?: number
}

function isTemplateTarget(resource: unknown): resource is TemplateTarget {
    return (
        !!resource &&
        typeof resource === 'object' &&
        typeof (resource as { templateFile?: unknown }).templateFile === 'string'
    )
}

/**
 * Open the synthesized CloudFormation template for a construct, positioned on
 * the resource's block when the language server provided an offset. Wired to the
 * inline "open template" icon shown on construct nodes whose context value ends
 * in `WithTemplate`.
 */
export async function openCdkTemplate(input?: unknown): Promise<void> {
    const target = isTreeNode(input) ? unboxTreeNode(input, isTemplateTarget) : undefined
    if (!target) {
        return
    }

    const document = await vscode.workspace.openTextDocument(vscode.Uri.file(target.templateFile))
    const options: vscode.TextDocumentShowOptions = {}
    if (target.templateOffset !== undefined) {
        // templateOffset is a 0-based character offset into the template text.
        const position = document.positionAt(target.templateOffset)
        options.selection = new vscode.Range(position, position)
    }
    await vscode.window.showTextDocument(document, options)
}
