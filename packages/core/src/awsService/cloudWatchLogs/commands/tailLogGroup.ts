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
import { ToolkitError } from '../../../shared/errors'
import { getLogger } from '../../../shared/logger/logger'
import globals from '../../../shared/extensionGlobals'
import { uriToKey } from '../cloudWatchLogsUtils'
import { LiveTailCodeLensProvider } from '../document/liveTailCodeLensProvider'
import { LogStreamFilterResponse } from '../wizard/liveTailLogStreamSubmenu'

export async function tailLogGroup(
    registry: LiveTailSessionRegistry,
    source: string,
    codeLensProvider: LiveTailCodeLensProvider,
    logData?: { regionName: string; groupName: string },
    logStreamFilterData?: LogStreamFilterResponse
): Promise<void> {
    await telemetry.cloudwatchlogs_startLiveTail.run(async (span) => {
        const wizard = new TailLogGroupWizard(logData, logStreamFilterData)
        const wizardResponse = await wizard.run()
        if (!wizardResponse) {
            throw new CancellationError('user')
        }
        if (wizardResponse.logStreamFilter.type === 'menu' || wizardResponse.logStreamFilter.type === undefined) {
            // logstream filter wizard uses type to determine which submenu to show. 'menu' is set when no type is selected
            // and to show the 'menu' of selecting a type. This should not be reachable due to the picker logic, but validating in case.
            throw new ToolkitError(`Invalid Log Stream filter type: ${wizardResponse.logStreamFilter.type}`)
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
            await vscode.window.showTextDocument(session.uri, { preview: false })
            void vscode.window.showInformationMessage(`Switching editor to an existing session that matches request.`)
            span.record({
                result: 'Succeeded',
                sessionAlreadyStarted: true,
                source: source,
            })
            return
        }
        const document = await prepareDocument(session)

        const disposables: vscode.Disposable[] = []
        disposables.push(hideShowStatusBarItemsOnActiveEditor(session, document))
        disposables.push(closeSessionWhenAllEditorsClosed(session, registry, document, codeLensProvider))

        try {
            const stream = await session.startLiveTailSession()
            registry.set(uriToKey(session.uri), session)
            codeLensProvider.refresh()
            getLogger().info(`LiveTail session started: ${uriToKey(session.uri)}`)
            span.record({
                source: source,
                result: 'Succeeded',
                sessionAlreadyStarted: false,
                hasTextFilter: Boolean(wizardResponse.filterPattern),
                filterType: wizardResponse.logStreamFilter.type,
            })
            await handleSessionStream(stream, document, session)
        } finally {
            for (const disposable of disposables) {
                disposable.dispose()
            }
        }
    })
}

export function closeSession(
    sessionUri: vscode.Uri,
    registry: LiveTailSessionRegistry,
    source: string,
    codeLensProvider: LiveTailCodeLensProvider
) {
    telemetry.cloudwatchlogs_stopLiveTail.run((span) => {
        const session = registry.get(uriToKey(sessionUri))
        if (session === undefined) {
            throw new ToolkitError(`No LiveTail session found for URI: ${uriToKey(sessionUri)}`)
        }
        session.stopLiveTailSession()
        registry.delete(uriToKey(sessionUri))
        void vscode.window.showInformationMessage(`Stopped LiveTail session: ${uriToKey(sessionUri)}`)
        codeLensProvider.refresh()
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
                    // Determine should scroll before adding new lines to doc because adding large
                    // amount of new lines can push bottom of file out of view before scrolling.
                    const editorsToScroll = getTextEditorsToScroll(document)
                    await updateTextDocumentWithNewLogEvents(formattedLogEvents, document, session.maxLines)
                    // eslint-disable-next-line unicorn/no-array-for-each
                    editorsToScroll.forEach(scrollTextEditorToBottom)
                }
                session.eventRate = eventRate(event.sessionUpdate)
                session.isSampled = isSampled(event.sessionUpdate)
            }
        }
    } catch (e) {
        if (session.isAborted) {
            // Expected case. User action cancelled stream (CodeLens, Close Editor, etc.).
            // AbortSignal interrupts the LiveTail stream, causing error to be thrown here.
            // Can assume that stopLiveTailSession() has already been called - AbortSignal is only
            // exposed through that method.
            getLogger().info(`LiveTail session stopped: ${uriToKey(session.uri)}`)
        } else {
            // Unexpected exception.
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

// Auto scroll visible LiveTail session editors if the end-of-file is in view.
// This allows for newly added log events to stay in view.
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
    for (const formattedLogEvent of formattedLogEvents) {
        edit.insert(document.uri, new vscode.Position(document.lineCount, 0), formattedLogEvent)
    }

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

function hideShowStatusBarItemsOnActiveEditor(
    session: LiveTailSession,
    document: vscode.TextDocument
): vscode.Disposable {
    return vscode.window.onDidChangeActiveTextEditor((editor) => {
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
function closeSessionWhenAllEditorsClosed(
    session: LiveTailSession,
    registry: LiveTailSessionRegistry,
    document: vscode.TextDocument,
    codeLensProvider: LiveTailCodeLensProvider
): vscode.Disposable {
    return vscode.window.tabGroups.onDidChangeTabs((tabEvent) => {
        const isOpen = isLiveTailSessionOpenInAnyTab(session)
        if (!isOpen) {
            closeSession(session.uri, registry, 'ClosedEditors', codeLensProvider)
            void clearDocument(document)
        }
    })
}

function isLiveTailSessionOpenInAnyTab(liveTailSession: LiveTailSession) {
    let isOpen = false
    // eslint-disable-next-line unicorn/no-array-for-each
    vscode.window.tabGroups.all.forEach(async (tabGroup) => {
        for (const tab of tabGroup.tabs) {
            if (tab.input instanceof vscode.TabInputText) {
                if (liveTailSession.uri.toString() === tab.input.uri.toString()) {
                    isOpen = true
                }
            }
        }
    })
    return isOpen
}
