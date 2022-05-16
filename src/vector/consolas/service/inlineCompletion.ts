/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { invocationContext, inlineCompletion, recommendations, telemetryContext } from '../models/model'
import { ConsolasConstants } from '../models/constants'
import { runtimeLanguageContext } from '../util/runtimeLanguageContext'
import { TelemetryHelper } from '../util/telemetryHelper'
/**
 * completion provider for inline suggestions
 */
let _range!: vscode.Range
const dimDecoration = vscode.window.createTextEditorDecorationType(<vscode.DecorationRenderOptions>{
    textDecoration: `none; opacity: ${50 / 100}`,
    color: '#DDDDDD',
})

async function resetInlineStates(editor: vscode.TextEditor) {
    inlineCompletion.items = []
    inlineCompletion.origin = []
    inlineCompletion.position = 0
    await vscode.commands.executeCommand('setContext', ConsolasConstants.serviceActiveKey, false)
    editor.setDecorations(dimDecoration, [])
}

function setRange(range: vscode.Range) {
    _range = range
}

export async function getCompletionItems() {
    const completionItems: string[] = []
    recommendations.response.forEach(async (recommendation, index) => {
        if (recommendation.content.length > 0) {
            completionItems.push(recommendation.content)
        }
    })
    return completionItems
}

export async function acceptRecommendation(editor: vscode.TextEditor) {
    if (invocationContext.isConsolasEditing) return
    invocationContext.isConsolasEditing = true
    await editor
        ?.edit(
            builder => {
                builder.replace(_range, inlineCompletion.items[inlineCompletion.position])
            },
            { undoStopAfter: true, undoStopBefore: true }
        )
        .then(async () => {
            let languageId = editor?.document?.languageId
            languageId = languageId === ConsolasConstants.typescript ? ConsolasConstants.javascript : languageId
            const languageContext = runtimeLanguageContext.getLanguageContext(languageId)
            const acceptArguments = [
                _range,
                inlineCompletion.position,
                inlineCompletion.items[inlineCompletion.position],
                recommendations.requestId,
                telemetryContext.triggerType,
                telemetryContext.completionType,
                languageContext.language,
            ] as const
            invocationContext.isConsolasEditing = false
            await vscode.commands.executeCommand('aws.consolas.accept', ...acceptArguments)
            await resetInlineStates(editor)
        })
}

export async function rejectRecommendation(
    editor: vscode.TextEditor | undefined,
    isTypeAheadRejection: boolean = false
) {
    if (!editor || invocationContext.isConsolasEditing) return
    if (!isTypeAheadRejection && inlineCompletion.items.length === 0) return
    invocationContext.isConsolasEditing = true
    await editor
        ?.edit(
            builder => {
                builder.delete(_range)
            },
            { undoStopAfter: false, undoStopBefore: false }
        )
        .then(async () => {
            invocationContext.isConsolasEditing = false
            await resetInlineStates(editor)
            TelemetryHelper.recordUserDecisionTelemetry(-1, editor.document.languageId)
        })
}

function getTypedPrefix(editor: vscode.TextEditor): string {
    return editor.document.getText(
        new vscode.Range(
            invocationContext.startPos.line,
            invocationContext.startPos.character,
            editor.selection.active.line,
            editor.selection.active.character
        )
    )
}

export async function setTypeAheadRecommendations(
    editor: vscode.TextEditor | undefined,
    event: vscode.TextDocumentChangeEvent
) {
    if (!editor || inlineCompletion.origin.length === 0) {
        invocationContext.isTypeaheadInProgress = false
        return
    }
    if (invocationContext.startPos != editor.selection.active) {
        const typedPrefix = getTypedPrefix(editor)
        inlineCompletion.items = []
        inlineCompletion.origin.forEach(item => {
            if (item.startsWith(typedPrefix)) inlineCompletion.items.push(item.substring(typedPrefix.length))
        })
        const currentPosition = new vscode.Position(editor.selection.active.line, editor.selection.active.character)
        let endPosition = new vscode.Position(_range.end.line, _range.end.character + 1)
        // if user input a newline, end line number of recommendation will change.
        const textChange = event.contentChanges[0].text
        if (
            textChange.startsWith(ConsolasConstants.lineBreak) ||
            textChange.startsWith(ConsolasConstants.lineBreakWin)
        ) {
            endPosition = new vscode.Position(_range.end.line + 1, _range.end.character + 1)
        }
        setRange(new vscode.Range(currentPosition, endPosition))
        if (inlineCompletion.items.length) {
            invocationContext.isTypeaheadInProgress = true
            inlineCompletion.position = 0
            await showRecommendation(editor)
        } else {
            invocationContext.isTypeaheadInProgress = false
            await rejectRecommendation(editor, true)
        }
    }
}

async function showRecommendation(editor: vscode.TextEditor) {
    invocationContext.isConsolasEditing = true
    await editor
        ?.edit(
            builder => {
                builder.delete(_range)
            },
            { undoStopAfter: false, undoStopBefore: false }
        )
        .then(async () => {
            if (inlineCompletion.items?.length > 0) {
                await editor
                    ?.edit(
                        builder => {
                            builder.insert(_range.start, inlineCompletion.items[inlineCompletion.position])
                        },
                        { undoStopAfter: false, undoStopBefore: false }
                    )
                    .then(async () => {
                        const pos = new vscode.Position(
                            editor.selection.active.line,
                            editor.selection.active.character + 1
                        )
                        /*
                         * When typeAhead is involved we set the position of character with one more character to net let
                         * last bracket of recommendation to be removed
                         */
                        if (invocationContext.isTypeaheadInProgress) setRange(new vscode.Range(_range.start, pos))
                        else setRange(new vscode.Range(_range.start, editor.selection.active))
                        editor.setDecorations(dimDecoration, [_range])
                        // cursor position
                        const position = editor.selection.active
                        const newPosition = position.with(_range.start.line, _range.start.character)
                        // set Position
                        const newSelection = new vscode.Selection(newPosition, newPosition)
                        editor.selection = newSelection
                        invocationContext.isConsolasEditing = false
                    })
            }
            invocationContext.isConsolasEditing = false
        })
}

export async function showFirstRecommendation(editor: vscode.TextEditor) {
    /**
     * Reject previous recommendations if there are ACTIVE ones
     */
    await rejectRecommendation(editor)
    if (invocationContext.isConsolasEditing) return
    getCompletionItems().then(async res => {
        inlineCompletion.origin = res
        inlineCompletion.items = res
        if (inlineCompletion.items.length > 0) {
            setRange(new vscode.Range(invocationContext.startPos, invocationContext.startPos))
            const newEditor = vscode.window.activeTextEditor
            if (!newEditor) return
            if (invocationContext.startPos !== newEditor.selection.active) {
                // Rejection when user has deleted/navigated triggers
                if (
                    invocationContext.startPos.line > newEditor.selection.active.line ||
                    (invocationContext.startPos.character > newEditor.selection.active.character &&
                        invocationContext.startPos.line === newEditor.selection.active.line)
                ) {
                    await rejectRecommendation(editor)
                    return
                }
                const typedPrefix = newEditor.document.getText(
                    new vscode.Range(
                        invocationContext.startPos.line,
                        invocationContext.startPos.character,
                        newEditor.selection.active.line,
                        newEditor.selection.active.character
                    )
                )
                if (typedPrefix.length > 0) inlineCompletion.items = []

                const currentPosition = new vscode.Position(
                    newEditor.selection.active.line,
                    newEditor.selection.active.character
                )

                setRange(new vscode.Range(currentPosition, currentPosition))
                inlineCompletion.origin.forEach(item => {
                    if (item.startsWith(typedPrefix)) {
                        inlineCompletion.items.push(item.substring(typedPrefix.length))
                    }
                })
                if (inlineCompletion.items.length === 0) {
                    await resetInlineStates(editor)
                    return
                }
            }

            if (inlineCompletion.items?.length > 0) {
                invocationContext.isConsolasEditing = true
                await editor
                    ?.edit(
                        builder => {
                            builder.insert(_range.start, inlineCompletion.items[inlineCompletion.position])
                        },
                        { undoStopAfter: false, undoStopBefore: false }
                    )
                    .then(async () => {
                        setRange(
                            new vscode.Range(
                                _range.start,
                                new vscode.Position(editor.selection.active.line, editor.selection.active.character)
                            )
                        )
                        editor.setDecorations(dimDecoration, [_range])
                        // cursor position
                        const position = editor.selection.active
                        const newPosition = position.with(_range.start.line, _range.start.character)
                        const newSelection = new vscode.Selection(newPosition, newPosition)
                        editor.selection = newSelection
                        // set Position
                        await vscode.commands.executeCommand('setContext', ConsolasConstants.serviceActiveKey, true)
                        invocationContext.isConsolasEditing = false
                    })
            }
        }
    })
}

export async function navigateRecommendation(editor: vscode.TextEditor, next: boolean) {
    if (
        !inlineCompletion.items?.length ||
        inlineCompletion.items.length === 1 ||
        invocationContext.isConsolasEditing ||
        !editor
    )
        return
    invocationContext.isConsolasEditing = true
    if (next) {
        inlineCompletion.position = (inlineCompletion.position + 1) % inlineCompletion.items.length
    } else {
        inlineCompletion.position = inlineCompletion.position - 1
        if (inlineCompletion.position < 0) {
            inlineCompletion.position = inlineCompletion.items.length - 1
        }
    }
    setRange(new vscode.Range(editor.selection.active, _range.end))
    await showRecommendation(editor)
}
