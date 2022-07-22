/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { Commands } from '../vscode/commands2'

class CompletionItemContainer {
    private running = false
    private disposed = false
    private readonly items: vscode.InlineCompletionItem[] = []
    private readonly onDidChangeEmitter = new vscode.EventEmitter<void>()
    public readonly onDidChange = this.onDidChangeEmitter.event

    public constructor(
        public readonly span: vscode.Range,
        private readonly generator: AsyncGenerator<vscode.InlineCompletionItem[], void>
    ) {}

    private get isCancelled() {
        // not sure when vscode triggers a cancellation
        return this.disposed // || this.token.isCancellationRequested
    }

    public contains(position: vscode.Position) {
        return position.line >= this.span.start.line && position.line <= this.span.end.line
    }

    public dispose() {
        this.disposed = true
        this.onDidChangeEmitter.dispose()
    }

    public getItems(position: vscode.Position) {
        if (!this.running) {
            this.start()
        }

        return this.items.map(i => this.translateItem(i, position))
    }

    private translateItem(item: vscode.InlineCompletionItem, position: vscode.Position) {
        // `span` should be computed from each item but right now it's effectively being
        // used as both the origin point and the bounds of the completion items
        const origin = position.line > this.span.start.line ? new vscode.Position(position.line, 0) : this.span.start

        const insertText = `${this.getPadding(origin)}${item.insertText}`
        const range = new vscode.Range(origin, position)

        return new vscode.InlineCompletionItem(insertText, range, item.command)
    }

    private getPadding(origin: vscode.Position) {
        const lineDelta = this.span.end.line - origin.line
        const charDelta = lineDelta === 0 ? this.span.end.character - origin.character : this.span.end.character

        return '\n'.repeat(lineDelta).concat(' '.repeat(charDelta))
    }

    private async start() {
        this.running = true

        for await (const items of this.generator) {
            if (this.isCancelled) {
                break
            }

            this.items.push(...items)
            this.onDidChangeEmitter.fire()
        }
    }
}

type CompletionItemGenerator = (
    document: vscode.TextDocument,
    position: vscode.Position
) => AsyncGenerator<vscode.InlineCompletionItem[], void>

export class PaginatedInlineCompletionItemProvider implements vscode.InlineCompletionItemProvider {
    private container: CompletionItemContainer | undefined

    public constructor(private readonly producer: CompletionItemGenerator) {}

    public provideInlineCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
        context: vscode.InlineCompletionContext,
        token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.InlineCompletionItem[]> {
        // some notes:
        // * items are prefix filtered by VSC using the insert range
        // * insert range must be on one line, otherwise nothing will show
        // * normal completion items are given precedence over inline completion items
        // * the editor UI for changing items is not updated by `triggerSuggestion`
        // * new items from subsequent yields won't be listed unless the user keeps typing
        // * `context.selectedCompletionInfo` is `undefined` if there are no normal completion items
        // * the ghost text is pushed forward by spaces/tabs even when the insert range is before the cursor

        // doesn't seem like there's an easy way to differentiate self-triggered invokes from every other
        // source. maybe a flag or some sort of token can be used
        if (context.triggerKind === vscode.InlineCompletionTriggerKind.Invoke) {
            return this.invoke(document, position)
        }

        if (
            !this.container?.span.start.isEqual(position) &&
            (!this.container?.contains(position) || ['.', ':'].includes(getPreviousCharacter(document, position)))
        ) {
            this.container?.dispose()
            this.container = undefined
        }

        return this.invoke(document, position)
    }

    private invoke(document: vscode.TextDocument, position: vscode.Position) {
        if (!this.container) {
            const span = this.getSpan(document, position)
            this.container = new CompletionItemContainer(span, this.producer(document, position))
            this.container.onDidChange(() => this.triggerSuggestion())
        }

        return this.container.getItems(position)
    }

    private getSpan(document: vscode.TextDocument, position: vscode.Position) {
        const wordRange = document.getWordRangeAtPosition(position)
        if (wordRange) {
            return new vscode.Range(wordRange.start, wordRange.start)
        }

        const previous = getPreviousCharacter(document, position)
        switch (previous) {
            case '.':
                return new vscode.Range(position, new vscode.Position(position.line, position.character + 1))
            case ':':
                return new vscode.Range(position, new vscode.Position(position.line + 1, position.character + 4))
        }

        return new vscode.Range(position, position)
    }

    private async triggerSuggestion() {
        const suggest = await Commands.get('editor.action.inlineSuggest.trigger')
        await suggest?.execute()
    }
}

function getPreviousCharacter(document: vscode.TextDocument, position: vscode.Position) {
    const i = document.offsetAt(position)
    return document.getText().slice(i - 1, i)
}
