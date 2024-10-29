/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'
import { InlineTask } from '../controller/inlineTask'
import { Decorations } from './inlineDecorator'

export function computeDecorations(task: InlineTask): Decorations | undefined {
    if (!task.diff) {
        return
    }

    const decorations: Decorations = {
        linesAdded: [],
        linesRemoved: [],
    }

    for (const edit of task.diff) {
        const countChanged = edit.range.end.line - edit.range.start.line - 1
        if (edit.type === 'deletion') {
            decorations.linesRemoved.push({
                range: new vscode.Range(edit.range.start.line, 0, edit.range.start.line + countChanged, 0),
            })
        } else if (edit.type === 'insertion') {
            decorations.linesAdded.push({
                range: new vscode.Range(edit.range.start.line, 0, edit.range.start.line + countChanged, 0),
            })
        }
    }
    return decorations
}
