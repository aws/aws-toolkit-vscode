/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as moment from 'moment'
import * as vscode from 'vscode'
import { CloudWatchLogs } from 'aws-sdk'
import { CloudWatchLogsSettings, parseCloudWatchLogsUri, uriToKey, isLogStreamUri } from '../cloudWatchLogsUtils'
import { getLogger } from '../../shared/logger'
import { INSIGHTS_TIMESTAMP_FORMAT } from '../../shared/constants'
import { DefaultCloudWatchLogsClient } from '../../shared/clients/cloudWatchLogsClient'
import { Timeout, waitTimeout } from '../../shared/utilities/timeoutUtils'
import { showMessageWithCancel } from '../../shared/utilities/messages'
import { findOccurencesOf } from '../../shared/utilities/textDocumentUtilities'
// TODO: Add debug logging statements

/**
 * Class which contains CRUD operations and persistence for CloudWatch Logs streams.
 */
export class LogStreamRegistry {
    private readonly _onDidChange: vscode.EventEmitter<vscode.Uri> = new vscode.EventEmitter<vscode.Uri>()
    private readonly searchHighlight = vscode.window.createTextEditorDecorationType({
        backgroundColor: new vscode.ThemeColor('list.focusHighlightForeground'),
    })
    public constructor(
        public readonly configuration: CloudWatchLogsSettings,
        private readonly activeLogs: Map<string, ActiveTab> = new Map<string, ActiveTab>()
    ) {
        this.registerLogHandlers()
    }

    /**
     * Event fired on log content change
     */
    public get onDidChange(): vscode.Event<vscode.Uri> {
        return this._onDidChange.event
    }

    /**
     * Adds an entry to the registry for the given URI.
     * @param uri Document URI
     * @param initialStreamData Initial Data to populate the registry ActiveTab Data.
     */
    public async registerLog(uri: vscode.Uri, initialStreamData: CloudWatchLogsData): Promise<void> {
        // ensure this is a CloudWatchLogs URI; don't need the return value, just need to make sure it doesn't throw.
        parseCloudWatchLogsUri(uri)
        if (!this.hasLog(uri)) {
            this.setLogData(uri, initialStreamData)
            await this.updateLog(uri, 'tail')
        }
    }

    public cleanUpDocument(document: vscode.TextDocument): void {
        if (this.hasLog(document.uri) && !isLogStreamUri(document.uri)) {
            this.clearStreamIdMap(document.uri)
        }
    }

    private registerLogHandlers(): void {
        vscode.workspace.onDidChangeTextDocument((event: vscode.TextDocumentChangeEvent) => {
            const eventUri = event.document.uri
            if (this.hasLog(eventUri) && !isLogStreamUri(eventUri)) {
                this.highlightDocument(eventUri)
            }
        })

        vscode.workspace.onDidCloseTextDocument(this.cleanUpDocument)
    }

    /**
     * Returns whether or not the log is registered.
     * @param uri Document URI
     */
    public hasLog(uri: vscode.Uri): boolean {
        return this.activeLogs.has(uriToKey(uri))
    }

    /**
     * Returns the currently-held log content for a URI as a formatted string.
     * @param uri Document URI
     * @param formatting Optional params for outputting log messages.
     */
    public getLogContent(uri: vscode.Uri, formatting?: { timestamps?: boolean }): string | undefined {
        const inlineNewLineRegex = /((\r\n)|\n|\r)(?!$)/g

        // if no timestamp for some reason, entering a blank of equal length (29 characters long)
        const timestampSpaceEquivalent = '                             '

        const currData = this.getLogData(uri)

        if (!currData) {
            return undefined
        }

        let output: string = ''
        let lineNumber = 0
        for (const datum of currData.data) {
            let line: string = datum.message ?? ''
            if (formatting?.timestamps) {
                // TODO: Handle different timezones and unix timestamps?
                const timestamp = datum.timestamp
                    ? moment(datum.timestamp).format(INSIGHTS_TIMESTAMP_FORMAT)
                    : timestampSpaceEquivalent
                line = timestamp.concat('\t', line)
                // log entries containing newlines are indented to the same length as the timestamp.
                line = line.replace(inlineNewLineRegex, `\n${timestampSpaceEquivalent}\t`)
            }

            if (!line.endsWith('\n')) {
                line = line.concat('\n')
            }

            const lineBreaks = (line.match(/\n/g) || []).length
            if (datum.logStreamName) {
                this.setRangeForStreamIdMap(uri, lineNumber, lineNumber + lineBreaks - 1, datum.logStreamName)
            }
            lineNumber += lineBreaks

            output = output.concat(line)
        }
        return output
    }
    /**
     * Retrieves the next set of data for a log and adds it to the registry. Data can either be added to the front of the log (`'head'`) or end (`'tail'`)
     * @param uri Document URI
     * @param headOrTail Determines update behavior: `'head'` retrieves the most recent previous token and appends data to the top of the log, `'tail'` does the opposite. Default: `'tail'`
     * @param getLogEventsFromUriComponentsFn Override for testing purposes.
     */
    public async updateLog(uri: vscode.Uri, headOrTail: 'head' | 'tail' = 'tail'): Promise<void> {
        const stream = this.getLogData(uri)
        if (!stream) {
            getLogger().debug(`No registry entry for ${uri.path}`)
            return
        }
        const nextToken = headOrTail === 'head' ? stream.previous?.token : stream.next?.token

        // TODO: Consider getPaginatedAwsCallIter? Would need a way to differentiate between head/tail...
        const logEvents = await stream.retrieveLogsFunction(stream.logGroupInfo, stream.parameters, nextToken)

        const newData =
            headOrTail === 'head'
                ? (logEvents.events ?? []).concat(stream.data)
                : stream.data.concat(logEvents.events ?? [])

        const tokens: Pick<CloudWatchLogsData, 'next' | 'previous'> = {}
        // update if no token exists or if the token is updated in the correct direction.
        if (!stream.previous || headOrTail === 'head') {
            tokens.previous = {
                token: logEvents.nextBackwardToken ?? '',
            }
        }
        if (!stream.next || headOrTail === 'tail') {
            tokens.next = {
                token: logEvents.nextForwardToken ?? '',
            }
        }
        this.setLogData(uri, {
            ...stream,
            ...tokens,
            data: newData,
        })

        this._onDidChange.fire(uri)
    }

    /**
     * Deletes a stream from the registry.
     * @param uri Document URI
     */
    public deregisterLog(uri: vscode.Uri): void {
        this.activeLogs.delete(uriToKey(uri))
    }

    public setBusyStatus(uri: vscode.Uri, isBusy: boolean): void {
        const log = this.getLogData(uri)
        if (log) {
            this.setLogData(uri, {
                ...log,
                busy: isBusy,
            })
        }
    }

    public getBusyStatus(uri: vscode.Uri): boolean {
        const log = this.getLogData(uri)

        return (log && log.busy) ?? false
    }

    public setLogData(uri: vscode.Uri, newData: CloudWatchLogsData): void {
        this.activeLogs.set(uriToKey(uri), {
            data: newData,
            editor: this.getTextEditor(uri),
            streamIds: this.getStreamIdMap(uri) ?? new Map<number, string>(),
        })
    }

    public getLogData(uri: vscode.Uri): CloudWatchLogsData | undefined {
        return this.activeLogs.get(uriToKey(uri))?.data
    }

    public setTextEditor(uri: vscode.Uri, textEditor: vscode.TextEditor): void {
        const oldData = this.getLogData(uri)
        const streamIds = this.getStreamIdMap(uri)
        if (!oldData) {
            throw new Error(`cwl: Unable to assign textEditor to activeLog entry ${uriToKey(uri)} with no log data.`)
        }
        if (!streamIds) {
            throw new Error(
                `cwl: Unable to assign textEditor to activeLog entry ${uriToKey(uri)} with no streamIDs map.`
            )
        }
        this.activeLogs.set(uriToKey(uri), { data: oldData, editor: textEditor, streamIds: streamIds })
    }

    public getTextEditor(uri: vscode.Uri): vscode.TextEditor | undefined {
        return this.activeLogs.get(uriToKey(uri))?.editor
    }

    public hasTextEditor(uri: vscode.Uri): boolean {
        return this.hasLog(uri) && this.getTextEditor(uri) !== undefined
    }

    public getStreamIdMap(uri: vscode.Uri): Map<number, string> | undefined {
        return this.activeLogs.get(uriToKey(uri))?.streamIds
    }

    private setRangeForStreamIdMap(uri: vscode.Uri, lowerBound: number, upperBound: number, streamID: string): void {
        // Note: Inclusive of both bounds.
        for (let currentLine = lowerBound; currentLine <= upperBound; currentLine++) {
            this.setStreamIdMap(uri, currentLine, streamID)
        }
    }

    private setStreamIdMap(uri: vscode.Uri, lineNum: number, streamID: string): void {
        const activeTab = this.getActiveTab(uri)
        if (!activeTab) {
            throw new Error(`cwl: Cannot set streamID for unregistered uri ${uri.path}`)
        }
        activeTab.streamIds.set(lineNum, streamID)
    }

    public clearStreamIdMap(uri: vscode.Uri): void {
        console.log(uri)
        const currentActiveTab = this.getActiveTab(uri)
        if (!currentActiveTab) {
            throw new Error(`cwl: Cannot clear streamIdMap for ununregistered uri ${uri.path}`)
        }
        this.setActiveTab(uri, {
            ...currentActiveTab,
            streamIds: new Map<number, string>(),
        })
    }

    private setActiveTab(uri: vscode.Uri, newActiveTab: ActiveTab): void {
        this.activeLogs.set(uriToKey(uri), newActiveTab)
    }

    public getActiveTab(uri: vscode.Uri): ActiveTab | undefined {
        return this.activeLogs.get(uriToKey(uri))
    }

    public async highlightDocument(uri: vscode.Uri): Promise<void> {
        const textEditor = this.getTextEditor(uri)
        const logData = this.getLogData(uri)

        if (!logData) {
            throw new Error(`cwl: Unable to highlight. Missing log data in registry for uri key: ${uriToKey(uri)}.`)
        }

        if (!textEditor) {
            throw new Error(`cwl: Unable to highlight. Missing textEditor in registry for uri key: ${uriToKey(uri)}.`)
        }

        if (logData.parameters.filterPattern) {
            const ranges = findOccurencesOf(textEditor.document, logData.parameters.filterPattern)
            textEditor.setDecorations(this.searchHighlight, ranges)
        }
    }
}

export async function filterLogEventsFromUriComponents(
    logGroupInfo: CloudWatchLogsGroupInfo,
    parameters: CloudWatchLogsParameters,
    nextToken?: string
): Promise<CloudWatchLogsResponse> {
    const client = new DefaultCloudWatchLogsClient(logGroupInfo.regionName)

    const cwlParameters: CloudWatchLogs.FilterLogEventsRequest = {
        logGroupName: logGroupInfo.groupName,
        filterPattern: parameters.filterPattern,
        nextToken,
        limit: parameters.limit,
    }

    if (parameters.startTime && parameters.endTime) {
        cwlParameters.startTime = parameters.startTime
        cwlParameters.endTime = parameters.endTime
    }

    if (parameters.streamNameOptions) {
        cwlParameters.logStreamNames = parameters.streamNameOptions
    }

    const timeout = new Timeout(300000)
    showMessageWithCancel(`Loading data from log group ${logGroupInfo.groupName}`, timeout)
    const responsePromise = client.filterLogEvents(cwlParameters)
    const response = await waitTimeout(responsePromise, timeout, { allowUndefined: false })

    // Use heuristic of last token as backward token and next token as forward to generalize token form.
    // Note that this may become inconsistent if the contents of the calls are changing as they are being made.
    // However, this fail wouldn't really impact customers.
    if (response) {
        return {
            events: response.events ? response.events : [],
            nextForwardToken: response.nextToken,
            nextBackwardToken: nextToken,
        }
    } else {
        throw new Error('cwl:`filterLogEvents` did not return anything.')
    }
}

export async function getLogEventsFromUriComponents(
    logGroupInfo: CloudWatchLogsGroupInfo,
    parameters: CloudWatchLogsParameters,
    nextToken?: string
): Promise<CloudWatchLogsResponse> {
    const client = new DefaultCloudWatchLogsClient(logGroupInfo.regionName)

    if (!logGroupInfo.streamName) {
        throw new Error(
            `Log Stream name not specified for log group ${logGroupInfo.groupName} on region ${logGroupInfo.regionName}`
        )
    }
    const response = await client.getLogEvents({
        logGroupName: logGroupInfo.groupName,
        logStreamName: logGroupInfo.streamName,
        nextToken,
        limit: parameters.limit,
    })

    if (!response) {
        throw new Error('cwl:`getLogEvents` did not return anything.')
    }

    return {
        events: response.events ? response.events : [],
        nextForwardToken: response.nextForwardToken,
        nextBackwardToken: response.nextBackwardToken,
    }
}

export function getInitialLogData(
    logGroupInfo: CloudWatchLogsGroupInfo,
    parameters: CloudWatchLogsParameters,
    retrieveLogsFunction: CloudWatchLogsAction
): CloudWatchLogsData {
    return {
        data: [],
        parameters: parameters,
        logGroupInfo: logGroupInfo,
        retrieveLogsFunction: retrieveLogsFunction,
        busy: false,
    }
}

export interface ActiveTab {
    data: CloudWatchLogsData
    editor?: vscode.TextEditor
    streamIds: Map<number, string>
}

export type CloudWatchLogsGroupInfo = {
    groupName: string
    regionName: string
    streamName?: string
}

export type CloudWatchLogsParameters = {
    filterPattern?: string
    startTime?: number
    endTime?: number
    limit?: number
    streamNameOptions?: string[]
}

export type CloudWatchLogsResponse = {
    events: CloudWatchLogs.FilteredLogEvents
    nextForwardToken?: CloudWatchLogs.NextToken
    nextBackwardToken?: CloudWatchLogs.NextToken
}

export type CloudWatchLogsAction = (
    logGroupInfo: CloudWatchLogsGroupInfo,
    apiParameters: CloudWatchLogsParameters,
    nextToken?: string
) => Promise<CloudWatchLogsResponse>

export type CloudWatchLogsEvent = CloudWatchLogs.OutputLogEvent & {
    logStreamName?: string
    eventId?: string
}

export class CloudWatchLogsData {
    data: CloudWatchLogsEvent[] = []
    parameters: CloudWatchLogsParameters = {}
    logGroupInfo!: CloudWatchLogsGroupInfo
    retrieveLogsFunction!: CloudWatchLogsAction
    next?: {
        token: CloudWatchLogs.NextToken
    }
    previous?: {
        token: CloudWatchLogs.NextToken
    }
    busy: boolean = false
}
