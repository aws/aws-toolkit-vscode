/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { CodeSelectionContextExtractor } from './codeSelection/codeSelectionExtractor'
import { CodeSelectionContext } from './codeSelection/model'
import { FileContextExtractor } from './file/fileExtractor'
import { FileContext } from './file/model'
import { EditorContext } from './model'
import { window } from 'vscode'

export enum TriggerType {
    ChatMessage = 'ChatMessage',
    ContextMenu = 'ContextMenu',
}

export class EditorContextExtractor {
    private readonly activeFileContextExtractor: FileContextExtractor
    private readonly codeSelectionContextExtractor: CodeSelectionContextExtractor

    public constructor() {
        this.activeFileContextExtractor = new FileContextExtractor()
        this.codeSelectionContextExtractor = new CodeSelectionContextExtractor()
    }

    public async extractContextForTrigger(triggerType: TriggerType): Promise<EditorContext | undefined> {
        switch (triggerType) {
            case TriggerType.ChatMessage:
                return {
                    activeFileContext: await this.extractActiveFileContext(),
                    codeSelectionContext: undefined,
                }
            case TriggerType.ContextMenu:
                return {
                    activeFileContext: await this.extractActiveFileContext(),
                    codeSelectionContext: await this.extractActiveEditorCodeSelectionContext(),
                }
        }
        return undefined
    }

    private async extractActiveEditorCodeSelectionContext(): Promise<CodeSelectionContext | undefined> {
        const editor = window.activeTextEditor
        if (editor === undefined) {
            return undefined
        }

        return this.codeSelectionContextExtractor.extract(editor)
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
