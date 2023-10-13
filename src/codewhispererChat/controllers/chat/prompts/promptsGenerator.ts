/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { EditorContextCommand } from '../../../commands/registerCommands'

// TODO: It's a workaround for the demo, we beed to remowe it after backend will be ready

export class PromptsGenerator {
    private editorContextMenuCommandVerbs: Map<EditorContextCommand, string> = new Map([
        ['aws.awsq.explainCode', 'Explain'],
        ['aws.awsq.refactorCode', 'Refactor'],
        ['aws.awsq.fixCode', 'Fix'],
        ['aws.awsq.optimizeCode', 'Optimize'],
    ])

    public getPromptForContextMenuCommand(command: EditorContextCommand, selectedCode: string): string {
        return [
            this.editorContextMenuCommandVerbs.get(command),
            ' the following part of my code to me:',
            '```\n ',
            selectedCode,
            '\n```',
        ].join('')
    }
}
