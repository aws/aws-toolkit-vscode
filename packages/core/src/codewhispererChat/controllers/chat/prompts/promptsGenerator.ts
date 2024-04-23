/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { EditorContextBaseCommandType, EditorContextCommand } from '../../../commands/registerCommands'

// TODO: It's a workaround for the demo, we need to remove it after backend will be ready

export class PromptsGenerator {
    private editorContextMenuCommandVerbs: Map<EditorContextBaseCommandType, string> = new Map([
        ['aws.amazonq.explainCode', 'Explain'],
        ['aws.amazonq.refactorCode', 'Refactor'],
        ['aws.amazonq.fixCode', 'Fix'],
        ['aws.amazonq.optimizeCode', 'Optimize'],
        ['aws.amazonq.sendToPrompt', 'Send to prompt'],
    ])

    public generateForContextMenuCommand(command: EditorContextCommand): string {
        if (command.type === 'aws.amazonq.explainIssue') {
            return `Explain the issue "${JSON.stringify(command.issue)}" and generate code demonstrating the fix`
        }
        return [this.editorContextMenuCommandVerbs.get(command.type), ' the selected codeblock'].join('')
    }
}
