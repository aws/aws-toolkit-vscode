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
    _context?.extensionContext.globalState.update(ConsolasConstants.CONSOLAS_SERVICE_ACTIVE_KEY, false)
    await vscode.commands.executeCommand('setContext', ConsolasConstants.CONSOLAS_SERVICE_ACTIVE_KEY, false)
    editor.setDecorations(dimDecoration, [])
}

export function setRange(range: vscode.Range) {
    _range = range
}

export function getRange() {
    return _range
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

export function acceptRecommendation(editor: vscode.TextEditor) {
    editor
        ?.insertSnippet(new vscode.SnippetString(inlineCompletion.items[inlineCompletion.position]), _range, {
            undoStopAfter: false,
            undoStopBefore: false,
        })
        .then(async _ => {
            let languageId = editor?.document?.languageId
            languageId = languageId === ConsolasConstants.TYPESCRIPT ? ConsolasConstants.JAVASCRIPT : languageId
            const languageContext = runtimeLanguageContext.getLanguageContext(languageId)
            const acceptArguments = [
                _range.start.line,
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

export function rejectRecommendation(editor: vscode.TextEditor | undefined) {
    if (!editor) return
    editor
        ?.edit(
            builder => {
                builder.replace(_range, '')
            },
            { undoStopAfter: false, undoStopBefore: false }
        )
        .then(async _ => {
            setDefault(editor)
            onRejection(_isManualTriggerEnabled, _isAutomatedTriggerEnabled)
        })
}

export async function setTypeAheadRecommendations(typedPrefix: string, editor: vscode.TextEditor | undefined) {
    if (!editor || invocationContext.isInlineActive) return
    if (invocationContext.startPos != editor?.selection.active) {
        inlineCompletion.items = []
        invocationContext.isInlineActive = true
        inlineCompletion.origin.forEach(item => {
            if (item.startsWith(typedPrefix)) inlineCompletion.items.push(item.substring(typedPrefix.length))
        })

        if (inlineCompletion.items.length) {
            inlineCompletion.position = 0

            const currentPosition = new vscode.Position(
                editor.selection.active.line,
                editor.selection.active.character + 1
            )
            setRange(new vscode.Range(currentPosition, _range.end))
            await showRecommendation(editor)
        }
    }
}

export async function showRecommendation(editor: vscode.TextEditor) {
    editor
        ?.edit(
            builder => {
                builder.replace(_range, '')
            },
            { undoStopAfter: false, undoStopBefore: false }
        )
        .then(_ => {
            editor
                ?.edit(
                    builder => {
                        if (inlineCompletion.items && inlineCompletion.items.length > 0) {
                            builder.insert(_range.start, inlineCompletion.items[inlineCompletion.position])
                        }
                    },
                    { undoStopAfter: false, undoStopBefore: false }
                )
                .then(_ => {
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
    if (invocationContext.isInlineActive) return
    invocationContext.isInlineActive = true
    getCompletionItems().then(res => {
        inlineCompletion.origin = res
        inlineCompletion.items = res
        if (inlineCompletion.items.length > 0) {
            setRange(new vscode.Range(invocationContext.startPos, invocationContext.startPos))
            editor
                ?.edit(
                    builder => {
                        if (inlineCompletion.items?.length > 0)
                            builder.insert(
                                invocationContext.startPos,
                                inlineCompletion.items[inlineCompletion.position]
                            )
                    },
                    { undoStopAfter: false, undoStopBefore: false }
                )
                .then(async _ => {
                    setRange(new vscode.Range(invocationContext.startPos, editor.selection.active))
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
