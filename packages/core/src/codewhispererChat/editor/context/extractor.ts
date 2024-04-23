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

export type TriggerType = 'ChatMessage' | 'ContextMenu' | 'QuickAction'

export class EditorContextExtractor {
    private readonly activeFileContextExtractor: FileContextExtractor
    private readonly focusAreaContextExtractor: FocusAreaContextExtractor

    public constructor() {
        this.activeFileContextExtractor = new FileContextExtractor()
        this.focusAreaContextExtractor = new FocusAreaContextExtractor()
    }

    public async extractContextForTrigger(triggerType: TriggerType): Promise<EditorContext | undefined> {
        switch (triggerType) {
            case 'ChatMessage':
                return {
                    activeFileContext: await this.extractActiveFileContext(),
                    focusAreaContext: await this.extractActiveEditorCodeSelectionContext(),
                }
            case 'ContextMenu':
                return {
                    activeFileContext: await this.extractActiveFileContext(),
                    focusAreaContext: await this.extractActiveEditorCodeSelectionContext(),
                }
            case 'QuickAction':
                return {
                    activeFileContext: undefined,
                    focusAreaContext: undefined,
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

    public isCodeBlockSelected(): boolean {
        const editor = window.activeTextEditor
        if (editor === undefined) {
            return false
        }

        return this.focusAreaContextExtractor.isCodeBlockSelected(editor)
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
