/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseCommandSource } from "../../shared/vscode/commands2"

/** Indicates a CodeWhisperer command was executed through a tree node */
export const cwTreeNodeSource = 'codewhispererTreeNode'
/** Indicates a CodeWhisperer command was executed through a quick pick item */
export const cwQuickPickSource = 'codewhispererQuickPick'

/** Indicates what caused the CodeWhisperer command to be executed, since a command can be executed from different "sources" */
export type CodeWhispererSource = typeof cwQuickPickSource | typeof cwTreeNodeSource

export class CodeWhispererCommandSource extends BaseCommandSource {
    constructor(override readonly source: CodeWhispererSource) { super(source) }
}

export function cwSource(source: CodeWhispererSource) {
    return new CodeWhispererCommandSource(source)
}
