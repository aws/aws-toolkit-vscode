/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'

export function getCursorState(selection: readonly vscode.Selection[]) {
    return selection.map((s) => ({
        range: {
            start: {
                line: s.start.line,
                character: s.start.character,
            },
            end: {
                line: s.end.line,
                character: s.end.character,
            },
        },
    }))
}
