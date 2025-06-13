/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'
import { CursorState } from '@aws/language-server-runtimes-types'

/**
 * Convert from vscode selection type to the general CursorState expected by the AmazonQLSP.
 * @param selection
 * @returns
 */
export function getCursorState(selection: readonly vscode.Selection[]): CursorState[] {
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
