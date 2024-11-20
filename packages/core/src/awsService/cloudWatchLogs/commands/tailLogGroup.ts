/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { telemetry } from '../../../shared/telemetry/telemetry'
import { TailLogGroupWizard } from '../wizard/tailLogGroupWizard'
import { CancellationError } from '../../../shared/utilities/timeoutUtils'
import { LiveTailSession, LiveTailSessionConfiguration } from '../registry/liveTailSession'
import { LiveTailSessionRegistry } from '../registry/liveTailSessionRegistry'
import {
    LiveTailSessionLogEvent,
    LiveTailSessionUpdate,
    StartLiveTailResponseStream,
} from '@aws-sdk/client-cloudwatch-logs'
import { getLogger, globals, ToolkitError } from '../../../shared'
import { uriToKey } from '../cloudWatchLogsUtils'

export async function tailLogGroup(
    registry: LiveTailSessionRegistry,
    source: string,
    logData?: { regionName: string; groupName: string }
): Promise<void> {
    await telemetry.cwlLiveTail_Start.run(async (span) => {
        const wizard = new TailLogGroupWizard(logData)
        const wizardResponse = await wizard.run()
        if (!wizardResponse) {
            throw new CancellationError('user')
        }
        const awsCredentials = await globals.awsContext.getCredentials()
        if (awsCredentials === undefined) {
            throw new ToolkitError('Failed to start LiveTail session: credentials are undefined.')
        }
        const liveTailSessionConfig: LiveTailSessionConfiguration = {
            logGroupArn: wizardResponse.regionLogGroupSubmenuResponse.data,
            logStreamFilter: wizardResponse.logStreamFilter,
            logEventFilterPattern: wizardResponse.filterPattern,
            region: wizardResponse.regionLogGroupSubmenuResponse.region,
            awsCredentials: awsCredentials,
        }
        const session = new LiveTailSession(liveTailSessionConfig)
        if (registry.has(uriToKey(session.uri))) {
            await prepareDocument(session)
            span.record({
                result: 'Succeeded',
                sessionAlreadyStarted: true,
                source: source,
            })
            return
        }

        registry.set(uriToKey(session.uri), session)

        const document = await prepareDocument(session)

        hideShowStatusBarItemsOnActiveEditor(session, document)
        registerTabChangeCallback(session, registry, document)

        const stream = await session.startLiveTailSession()
        span.record({
            source: source,
            result: 'Succeeded',
            sessionAlreadyStarted: false,
            hasLogEventFilterPattern: Boolean(wizardResponse.filterPattern),
            logStreamFilterType: wizardResponse.logStreamFilter.type,
        })
        await handleSessionStream(stream, document, session)
    })
}

export function closeSession(sessionUri: vscode.Uri, registry: LiveTailSessionRegistry, source: string) {
    telemetry.cwlLiveTail_Stop.run((span) => {
        const session = registry.get(uriToKey(sessionUri))
        if (session === undefined) {
            throw new ToolkitError(`No LiveTail session found for URI: ${sessionUri.toString()}`)
        }
        session.stopLiveTailSession()
        registry.delete(uriToKey(sessionUri))
        span.record({
            result: 'Succeeded',
            source: source,
            duration: session.getLiveTailSessionDuration(),
        })
    })
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
    session: LiveTailSession
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
                session.eventRate = eventRate(event.sessionUpdate)
                session.isSampled = isSampled(event.sessionUpdate)
            }
        }
    } catch (e) {
        if (session.isAborted) {
            //Expected case. User action cancelled stream (CodeLens, Close Editor, etc.).
            //AbortSignal interrupts the LiveTail stream, causing error to be thrown here.
            //Can assume that stopLiveTailSession() has already been called - AbortSignal is only
            //exposed through that method.
            getLogger().info(`Session stopped: ${uriToKey(session.uri)}`)
        } else {
            //Unexpected exception.
            session.stopLiveTailSession()
            throw ToolkitError.chain(
                e,
                `Unexpected on-stream exception while tailing session: ${session.uri.toString()}`
            )
        }
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

function isSampled(event: LiveTailSessionUpdate): boolean {
    return event.sessionMetadata === undefined || event.sessionMetadata.sampled === undefined
        ? false
        : event.sessionMetadata.sampled
}

function eventRate(event: LiveTailSessionUpdate): number {
    return event.sessionResults === undefined ? 0 : event.sessionResults.length
}

function hideShowStatusBarItemsOnActiveEditor(session: LiveTailSession, document: vscode.TextDocument) {
    vscode.window.onDidChangeActiveTextEditor((editor) => {
        session.showStatusBarItem(editor?.document === document)
    })
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
    document: vscode.TextDocument
) {
    vscode.window.tabGroups.onDidChangeTabs((tabEvent) => {
        const isOpen = isLiveTailSessionOpenInAnyTab(session)
        if (!isOpen) {
            closeSession(session.uri, registry, 'ClosedEditors')
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
