/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { FileContextExtractor } from './file/fileExtractor'
import { FileContext } from './file/model'
import { EditorContext } from './model'
import { window } from 'vscode'

export enum TriggerType {
    ChatMessage = 'ChatMessage',
}

export class EditorContextExtractor {
    private readonly activeFileContextExtractor: FileContextExtractor

    public constructor() {
        this.activeFileContextExtractor = new FileContextExtractor()
    }

    public async extractContextForTrigger(triggerType: TriggerType): Promise<EditorContext | undefined> {
        if (triggerType == TriggerType.ChatMessage) {
            return {
                activeFileContext: await this.extractActiveFileContext(),
            }
        }

        return undefined
    }

    private async extractActiveFileContext(): Promise<FileContext | undefined> {
        const editor = window.activeTextEditor
        if (editor === undefined) {
            return undefined
        }
        const currentFile = editor.document
        if (currentFile === undefined) {
            return undefined
        }
        return this.activeFileContextExtractor.extract(currentFile)
    }
}
