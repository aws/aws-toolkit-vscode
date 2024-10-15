/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { TailLogGroupWizard } from '../wizard/tailLogGroupWizard'
import { CancellationError } from '../../../shared/utilities/timeoutUtils'
import { LiveTailSession, LiveTailSessionConfiguration } from '../registry/liveTailSession'
import { LiveTailSessionRegistry } from '../registry/liveTailSessionRegistry'
import { LiveTailSessionLogEvent, StartLiveTailResponseStream } from '@aws-sdk/client-cloudwatch-logs'
import { ToolkitError } from '../../../shared'

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
    registerTabChangeCallback(session, registry, document)
    const stream = await session.startLiveTailSession()

    await handleSessionStream(stream, document, session)
}

export function closeSession(sessionUri: vscode.Uri, registry: LiveTailSessionRegistry) {
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
    return textDocument
}

async function handleSessionStream(
    stream: AsyncIterable<StartLiveTailResponseStream>,
    document: vscode.TextDocument,
    session: LiveTailSession
) {
    try {
        for await (const event of stream) {
            if (event.sessionUpdate !== undefined) {
                const formattedLogEvents = event.sessionUpdate.sessionResults!.map<string>((logEvent) =>
                    formatLogEvent(logEvent)
                )
                if (formattedLogEvents.length !== 0) {
                    await updateTextDocumentWithNewLogEvents(formattedLogEvents, document, session.maxLines)
                }
            }
        }
    } catch (err) {
        throw new ToolkitError('Caught on-stream exception')
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

async function updateTextDocumentWithNewLogEvents(
    formattedLogEvents: string[],
    document: vscode.TextDocument,
    maxLines: number
) {
    const edit = new vscode.WorkspaceEdit()
    formattedLogEvents.forEach((formattedLogEvent) =>
        edit.insert(document.uri, new vscode.Position(document.lineCount, 0), formattedLogEvent)
    )
    await vscode.workspace.applyEdit(edit)
}

function registerTabChangeCallback(
    session: LiveTailSession,
    registry: LiveTailSessionRegistry,
    document: vscode.TextDocument
) {
    vscode.window.tabGroups.onDidChangeTabs((tabEvent) => {
        const isOpen = isLiveTailSessionOpenInAnyTab(session)
        if (!isOpen) {
            closeSession(session.uri, registry)
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
