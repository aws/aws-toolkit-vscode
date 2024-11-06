/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { TailLogGroupWizard } from '../wizard/tailLogGroupWizard'
import { CancellationError } from '../../../shared/utilities/timeoutUtils'
import { LiveTailSession, LiveTailSessionConfiguration } from '../registry/liveTailSession'
import { LiveTailSessionRegistry } from '../registry/liveTailSessionRegistry'
import {
    LiveTailSessionLogEvent,
    LiveTailSessionUpdate,
    StartLiveTailResponseStream,
} from '@aws-sdk/client-cloudwatch-logs'
import { globals, ToolkitError } from '../../../shared'

export async function tailLogGroup(
    registry: LiveTailSessionRegistry,
    logData?: { regionName: string; groupName: string }
): Promise<void> {
    const wizard = new TailLogGroupWizard(logData)
    const wizardResponse = await wizard.run()
    if (!wizardResponse) {
        throw new CancellationError('user')
    }

    const liveTailSessionConfig: LiveTailSessionConfiguration = {
        logGroupName: wizardResponse.regionLogGroupSubmenuResponse.data,
        logStreamFilter: wizardResponse.logStreamFilter,
        logEventFilterPattern: wizardResponse.filterPattern,
        region: wizardResponse.regionLogGroupSubmenuResponse.region,
    }
    const session = new LiveTailSession(liveTailSessionConfig)
    if (registry.has(session.uri)) {
        await prepareDocument(session)
        return
    }
    registry.set(session.uri, session)

    const document = await prepareDocument(session)
    const timer = startSessionTimer(session)
    hideShowStatusBarItemsOnActiveEditor(session, document)
    registerTabChangeCallback(session, registry, document, timer)

    const stream = await session.startLiveTailSession()

    await handleSessionStream(stream, document, session, timer)
}

export function closeSession(sessionUri: vscode.Uri, registry: LiveTailSessionRegistry, timer: NodeJS.Timer) {
    globals.clock.clearInterval(timer)
    const session = registry.get(sessionUri)
    if (session === undefined) {
        throw new ToolkitError(`No LiveTail session found for URI: ${sessionUri.toString()}`)
    }
    session.stopLiveTailSession()
    registry.delete(sessionUri)
}

export async function clearDocument(textDocument: vscode.TextDocument) {
    const edit = new vscode.WorkspaceEdit()
    const startPosition = new vscode.Position(0, 0)
    const endPosition = new vscode.Position(textDocument.lineCount, 0)
    edit.delete(textDocument.uri, new vscode.Range(startPosition, endPosition))
    await vscode.workspace.applyEdit(edit)
}

async function prepareDocument(session: LiveTailSession): Promise<vscode.TextDocument> {
    const textDocument = await vscode.workspace.openTextDocument(session.uri)
    await clearDocument(textDocument)
    await vscode.window.showTextDocument(textDocument, { preview: false })
    await vscode.languages.setTextDocumentLanguage(textDocument, 'log')
    session.showStatusBarItem(true)
    return textDocument
}

async function handleSessionStream(
    stream: AsyncIterable<StartLiveTailResponseStream>,
    document: vscode.TextDocument,
    session: LiveTailSession,
    timer: NodeJS.Timer
) {
    try {
        for await (const event of stream) {
            if (event.sessionUpdate !== undefined && event.sessionUpdate.sessionResults !== undefined) {
                const formattedLogEvents = event.sessionUpdate.sessionResults.map<string>((logEvent) =>
                    formatLogEvent(logEvent)
                )
                if (formattedLogEvents.length !== 0) {
                    //Determine should scroll before adding new lines to doc because adding large
                    //amount of new lines can push bottom of file out of view before scrolling.
                    const editorsToScroll = getTextEditorsToScroll(document)
                    await updateTextDocumentWithNewLogEvents(formattedLogEvents, document, session.maxLines)
                    editorsToScroll.forEach(scrollTextEditorToBottom)
                }
                updateStatusBarItemsOnStreamEvent(session, event.sessionUpdate)
            }
        }
    } finally {
        globals.clock.clearInterval(timer)
    }
}

function formatLogEvent(logEvent: LiveTailSessionLogEvent): string {
    if (!logEvent.timestamp || !logEvent.message) {
        return ''
    }
    const timestamp = new Date(logEvent.timestamp).toLocaleTimeString('en', {
        timeStyle: 'medium',
        hour12: false,
        timeZone: 'UTC',
    })
    let line = timestamp.concat('\t', logEvent.message)
    if (!line.endsWith('\n')) {
        line = line.concat('\n')
    }
    return line
}

//Auto scroll visible LiveTail session editors if the end-of-file is in view.
//This allows for newly added log events to stay in view.
function getTextEditorsToScroll(document: vscode.TextDocument): vscode.TextEditor[] {
    return vscode.window.visibleTextEditors.filter((editor) => {
        if (editor.document !== document) {
            return false
        }
        return editor.visibleRanges[0].contains(new vscode.Position(document.lineCount - 1, 0))
    })
}

function scrollTextEditorToBottom(editor: vscode.TextEditor) {
    const position = new vscode.Position(Math.max(editor.document.lineCount - 2, 0), 0)
    editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.Default)
}

async function updateTextDocumentWithNewLogEvents(
    formattedLogEvents: string[],
    document: vscode.TextDocument,
    maxLines: number
) {
    const edit = new vscode.WorkspaceEdit()
    formattedLogEvents.forEach((formattedLogEvent) =>
        edit.insert(document.uri, new vscode.Position(document.lineCount, 0), formattedLogEvent)
    )
    if (document.lineCount + formattedLogEvents.length > maxLines) {
        trimOldestLines(formattedLogEvents.length, maxLines, document, edit)
    }
    await vscode.workspace.applyEdit(edit)
}

function trimOldestLines(
    numNewLines: number,
    maxLines: number,
    document: vscode.TextDocument,
    edit: vscode.WorkspaceEdit
) {
    const numLinesToTrim = document.lineCount + numNewLines - maxLines
    const startPosition = new vscode.Position(0, 0)
    const endPosition = new vscode.Position(numLinesToTrim, 0)
    const range = new vscode.Range(startPosition, endPosition)
    edit.delete(document.uri, range)
}

function updateStatusBarItemsOnStreamEvent(session: LiveTailSession, event: LiveTailSessionUpdate) {
    updateIsSampled(session, event)
    updateEventRate(session, event)
}

function updateIsSampled(session: LiveTailSession, event: LiveTailSessionUpdate) {
    session.isSampled =
        event.sessionMetadata === undefined || event.sessionMetadata.sampled === undefined
            ? false
            : event.sessionMetadata.sampled
}

function updateEventRate(session: LiveTailSession, event: LiveTailSessionUpdate) {
    session.eventRate = event.sessionResults === undefined ? 0 : event.sessionResults.length
}

function hideShowStatusBarItemsOnActiveEditor(session: LiveTailSession, document: vscode.TextDocument) {
    vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (editor?.document === document) {
            session.showStatusBarItem(true)
        } else {
            session.showStatusBarItem(false)
        }
    })
}

function startSessionTimer(session: LiveTailSession): NodeJS.Timer {
    return globals.clock.setInterval(() => {
        session.updateStatusBarItemText()
    }, 500)
}

/**
 * The LiveTail session should be automatically closed if the user does not have the session's
 * document in any Tab in their editor.
 *
 * `onDidCloseTextDocument` doesn't work for our case because the tailLogGroup command will keep the stream
 * writing to the doc even when all its tabs/editors are closed, seemingly keeping the doc 'open'.
 * Also there is no guarantee that this event fires when an editor tab is closed
 *
 * `onDidChangeVisibleTextEditors` returns editors that the user can see its contents. An editor that is open, but hidden
 * from view, will not be returned. Meaning a Tab that is created (shown in top bar), but not open, will not be returned. Even if
 * the tab isn't visible, we want to continue writing to the doc, and keep the session alive.
 */
function registerTabChangeCallback(
    session: LiveTailSession,
    registry: LiveTailSessionRegistry,
    document: vscode.TextDocument,
    timer: NodeJS.Timer
) {
    vscode.window.tabGroups.onDidChangeTabs((tabEvent) => {
        const isOpen = isLiveTailSessionOpenInAnyTab(session)
        if (!isOpen) {
            closeSession(session.uri, registry, timer)
            void clearDocument(document)
        }
    })
}

function isLiveTailSessionOpenInAnyTab(liveTailSession: LiveTailSession) {
    let isOpen = false
    vscode.window.tabGroups.all.forEach(async (tabGroup) => {
        tabGroup.tabs.forEach((tab) => {
            if (tab.input instanceof vscode.TabInputText) {
                if (liveTailSession.uri.toString() === tab.input.uri.toString()) {
                    isOpen = true
                }
            }
        })
    })
    return isOpen
}
