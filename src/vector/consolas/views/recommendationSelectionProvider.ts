/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { invocationContext, inlineCompletion, recommendations, telemetryContext } from '../models/model'
import { getCompletionItems } from '../service/completionProvider'
import { ExtContext } from '../../../shared/extensions'
import { ConsolasConstants } from '../models/constants'
import { runtimeLanguageContext } from '../../../vector/consolas/util/runtimeLanguageContext'
import { onRejection } from '../commands/onRejection'

let _range!: vscode.Range
let _context!: ExtContext
let _isManualTriggerEnabled = false
let _isAutomatedTriggerEnabled = false
const dimDecoration = vscode.window.createTextEditorDecorationType(<vscode.DecorationRenderOptions>{
    textDecoration: `none; opacity: ${50 / 100}`,
    color: '#DDDDDD',
})

async function setDefault(editor: vscode.TextEditor) {
    inlineCompletion.items = []
    inlineCompletion.origin = []
    inlineCompletion.position = 0
    invocationContext.isInlineActive = false
    _context?.extensionContext.globalState.update(ConsolasConstants.CONSOLAS_SERVICE_ACTIVE_KEY, false)
    await vscode.commands.executeCommand('setContext', ConsolasConstants.CONSOLAS_SERVICE_ACTIVE_KEY, false)
    editor.setDecorations(dimDecoration, [])
}

function setRange(range: vscode.Range) {
    _range = range
}

export function setContextAndTrigger(
    context: ExtContext,
    isManualTriggerEnabled: boolean,
    isAutomatedTriggerEnabled: boolean
) {
    _context = context
    _isManualTriggerEnabled = isManualTriggerEnabled
    _isAutomatedTriggerEnabled = isAutomatedTriggerEnabled
}

export async function acceptRecommendation(editor: vscode.TextEditor) {
    if (invocationContext.isInlineActive) return
    invocationContext.isInlineActive = true
    await editor
        .edit(
            builder => {
                builder.replace(_range, inlineCompletion.items[inlineCompletion.position])
            },
            { undoStopAfter: false, undoStopBefore: false }
        )
        .then(async () => {
            let languageId = editor?.document?.languageId
            languageId = languageId === ConsolasConstants.TYPESCRIPT ? ConsolasConstants.JAVASCRIPT : languageId
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

            vscode.commands.executeCommand('aws.consolas.accept', ...acceptArguments)
            await setDefault(editor)
        })
}

export async function rejectRecommendation(
    editor: vscode.TextEditor | undefined,
    isTypeAheadRejection: boolean = false
) {
    if (!editor) return
    if (!isTypeAheadRejection && inlineCompletion.items.length === 0) return
    invocationContext.isInlineActive = true
    await onRejection(_isManualTriggerEnabled, _isAutomatedTriggerEnabled)
    await editor
        ?.edit(
            builder => {
                builder.delete(_range)
            },
            { undoStopAfter: false, undoStopBefore: false }
        )
        .then(async () => {
            await setDefault(editor)
        })
}

function getTypedPrefix(editor: vscode.TextEditor): string {
    return editor.document.getText(
        new vscode.Range(
            invocationContext.startPos.line,
            invocationContext.startPos.character,
            editor.selection.active.line,
            editor.selection.active.character + 1
        )
    )
}

export async function setTypeAheadRecommendations(
    editor: vscode.TextEditor | undefined,
    event: vscode.TextDocumentChangeEvent
) {
    if (
        !editor ||
        invocationContext.isInlineActive ||
        !invocationContext.isActive ||
        inlineCompletion.origin.length === 0
    )
        return
    if (invocationContext.startPos != editor?.selection.active) {
        const typedPrefix = getTypedPrefix(editor)
        inlineCompletion.items = []
        invocationContext.isInlineActive = true
        inlineCompletion.origin.forEach(item => {
            if (item.startsWith(typedPrefix)) inlineCompletion.items.push(item.substring(typedPrefix.length))
        })

        if (inlineCompletion.items.length) {
            inlineCompletion.position = 0

            let currentPosition = new vscode.Position(
                editor.selection.active.line,
                editor.selection.active.character + 1
            )
            let endPosition = new vscode.Position(_range.end.line, _range.end.character + 1)
            if (event.contentChanges[0].text.startsWith(ConsolasConstants.LINE_BREAK)) {
                currentPosition = new vscode.Position(
                    editor.selection.active.line + 1,
                    event.contentChanges[0].text.length
                )
                endPosition = new vscode.Position(_range.end.line + 1, _range.end.character + 1)
            }
            setRange(new vscode.Range(currentPosition, endPosition))
            await showRecommendation(editor)
        } else {
            const currentPosition = new vscode.Position(
                editor.selection.active.line,
                editor.selection.active.character + 1
            )
            const endPosition = new vscode.Position(_range.end.line, _range.end.character + 1)
            setRange(new vscode.Range(currentPosition, endPosition))
            await rejectRecommendation(editor, true)
        }
    }
}

async function showRecommendation(editor: vscode.TextEditor) {
    await editor
        ?.edit(
            builder => {
                builder.delete(_range)
            },
            { undoStopAfter: false, undoStopBefore: false }
        )
        .then(async () => {
            await editor
                ?.edit(
                    builder => {
                        if (inlineCompletion.items && inlineCompletion.items.length > 0) {
                            builder.insert(_range.start, inlineCompletion.items[inlineCompletion.position])
                        }
                    },
                    { undoStopAfter: false, undoStopBefore: false }
                )
                .then(async () => {
                    setRange(new vscode.Range(_range.start, editor.selection.active))
                    editor.setDecorations(dimDecoration, [_range])
                    // cursor position
                    const position = editor.selection.active
                    const newPosition = position.with(_range.start.line, _range.start.character)
                    // set Position
                    const newSelection = new vscode.Selection(newPosition, newPosition)
                    editor.selection = newSelection
                    invocationContext.isInlineActive = false
                })
        })
}

export async function showFirstRecommendation(editor: vscode.TextEditor) {
    /**
     * Reject previous recommendations if there are ACTIVE ones
     */
    await rejectRecommendation(editor)
    if (invocationContext.isInlineActive) return
    getCompletionItems().then(async res => {
        invocationContext.isActive = true
        invocationContext.isInlineActive = true
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
                    rejectRecommendation(editor)
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
                inlineCompletion.items = []
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
                    await onRejection(_isManualTriggerEnabled, _isAutomatedTriggerEnabled)
                    await setDefault(editor)
                    return
                }
            }
            await editor
                ?.edit(
                    builder => {
                        if (inlineCompletion.items?.length > 0)
                            builder.insert(_range.start, inlineCompletion.items[inlineCompletion.position])
                    },
                    { undoStopAfter: false, undoStopBefore: false }
                )
                .then(async () => {
                    setRange(
                        new vscode.Range(
                            _range.start,
                            new vscode.Position(editor.selection.active.line, editor.selection.active.character + 1)
                        )
                    )
                    editor.setDecorations(dimDecoration, [_range])
                    // cursor position
                    const position = editor.selection.active
                    const newPosition = position.with(_range.start.line, _range.start.character)
                    const newSelection = new vscode.Selection(newPosition, newPosition)
                    editor.selection = newSelection
                    // set Position
                    _context?.extensionContext.globalState.update(ConsolasConstants.CONSOLAS_SERVICE_ACTIVE_KEY, true)
                    await vscode.commands.executeCommand(
                        'setContext',
                        ConsolasConstants.CONSOLAS_SERVICE_ACTIVE_KEY,
                        true
                    )
                    invocationContext.isInlineActive = false
                })
        }
    })
}

export async function showNextRecommendation(editor: vscode.TextEditor) {
    if (
        !invocationContext.isActive ||
        !inlineCompletion.items?.length ||
        inlineCompletion.items.length === 1 ||
        invocationContext.isInlineActive
    )
        return
    invocationContext.isInlineActive = true
    const nextOffset = inlineCompletion.position + 1
    if (!editor) return
    if (nextOffset >= inlineCompletion.items.length) {
        inlineCompletion.position = 0
        setRange(new vscode.Range(editor.selection.active, _range.end))
        await showRecommendation(editor)
    } else if (nextOffset < inlineCompletion.items.length) {
        inlineCompletion.position = nextOffset
        setRange(new vscode.Range(editor.selection.active, _range.end))
        await showRecommendation(editor)
    }
}

export async function showPreviousRecommendation(editor: vscode.TextEditor) {
    if (
        !invocationContext.isActive ||
        !inlineCompletion.items?.length ||
        inlineCompletion.items.length === 1 ||
        invocationContext.isInlineActive
    )
        return
    const previousOffset = inlineCompletion.position - 1
    invocationContext.isInlineActive = true
    if (previousOffset < 0) {
        inlineCompletion.position = inlineCompletion.items.length - 1
    } else {
        inlineCompletion.position = previousOffset
    }

    if (!editor) return
    setRange(new vscode.Range(editor.selection.active, _range.end))
    await showRecommendation(editor)
}
