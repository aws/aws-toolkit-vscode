/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { FocusAreaContextExtractor } from './focusArea/focusAreaExtractor'
import { FocusAreaContext } from './focusArea/model'
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
    private readonly focusAreaContextExtractor: FocusAreaContextExtractor

    public constructor() {
        this.activeFileContextExtractor = new FileContextExtractor()
        this.focusAreaContextExtractor = new FocusAreaContextExtractor()
    }

    public async extractContextForTrigger(triggerType: TriggerType): Promise<EditorContext | undefined> {
        switch (triggerType) {
            case TriggerType.ChatMessage:
                return {
                    activeFileContext: await this.extractActiveFileContext(),
                    focusAreaContext: await this.extractActiveEditorCodeSelectionContext(),
                }
            case TriggerType.ContextMenu:
                return {
                    activeFileContext: await this.extractActiveFileContext(),
                    focusAreaContext: await this.extractActiveEditorCodeSelectionContext(),
                }
        }
        return undefined
    }

    private async extractActiveEditorCodeSelectionContext(): Promise<FocusAreaContext | undefined> {
        const editor = window.activeTextEditor
        if (editor === undefined) {
            return undefined
        }

        return this.focusAreaContextExtractor.extract(editor)
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
