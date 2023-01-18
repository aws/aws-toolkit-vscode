/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    ExtensionContext,
    TerminalLinkProvider,
    EventEmitter,
    TerminalLinkContext,
    CancellationToken,
    window,
    DiagnosticSeverity,
} from 'vscode'
import { SearchTerminalLink } from './interfaces'
import { v4 as uuid } from 'uuid'
import { extractContext } from '../utils/context-extraction'
import { TelemetryClientSession } from '../telemetry/telemetry/client'
import { ErrorMetadata, ErrorType, TelemetryEventName } from '../telemetry/telemetry/types'
import { LiveSearchDisplay } from '../views/live-search'
import { NotificationInfoStore } from '../stores/notificationsInfoStore'
import { Query } from '../models/model'
import { telemetry } from '../../shared/telemetry/telemetry'

const PYTHON_JS_ERROR_TRACE: RegExp = /^(?<errorName>\w*Error): (?<errorMessage>.*)$/
const JVM_ERROR: RegExp = /Exception in thread "(?<thread>[^"]+)" (?<errorName>[\w.]+): (?<errorMessage>.*)/
const TERMINAL_ERROR_NOTIFICATION = 'live_search_terminal_error'

interface ErrorCache {
    [errorMessage: string]: boolean
}

export class TerminalLinkSearch implements TerminalLinkProvider<SearchTerminalLink> {
    private errorCache: ErrorCache = {}

    constructor(
        readonly queryEmitter: EventEmitter<Query>,
        readonly telemetrySession: TelemetryClientSession,
        readonly liveSearchDisplay: LiveSearchDisplay,
        readonly notificationInfoStore: NotificationInfoStore
    ) { }

    public activate(context: ExtensionContext): void {
        context.subscriptions.push(window.registerTerminalLinkProvider(this))
    }

    async provideTerminalLinks(context: TerminalLinkContext, _: CancellationToken): Promise<SearchTerminalLink[]> {
        const error = PYTHON_JS_ERROR_TRACE.exec(context.line) ?? JVM_ERROR.exec(context.line)
        if (!error?.groups) {
            return []
        }
        const { errorName, errorMessage } = error.groups
        const message = `${errorName} ${errorMessage}`
        const editor = window.activeTextEditor
        const errorMetadata = {
            message,
            severity: DiagnosticSeverity.Error.toString(),
            errorId: uuid(),
            file: editor?.document?.fileName ?? '',
            languageId: editor?.document?.languageId ?? '',
            type: ErrorType.TERMINAL,
        }
        const query: Query = {
            trigger: 'TerminalLink',
            input: message,
            queryContext: await extractContext(false),
            queryId: uuid(),
            sourceId: errorMetadata.errorId,
            codeSelection: {
                selectedCode: '',
                file: {
                    range: {
                        start: { row: '', column: '' },
                        end: { row: '', column: '' },
                    },
                    name: '',
                },
            },
        }

        if (this.isNewError(errorMetadata)) {
            this.telemetrySession.recordEvent(TelemetryEventName.OBSERVE_ERROR, { errorMetadata })
            if (await this.liveSearchDisplay.canShowLiveSearchPane()) {
                this.queryEmitter.fire({ ...query, implicit: true })
            } else {
                const notificationInfo = await this.notificationInfoStore.getRecordFromWorkplaceStore(
                    TERMINAL_ERROR_NOTIFICATION
                )
                if (notificationInfo === undefined || !notificationInfo.muted) {
                    await this.showNotification(query)
                }
            }
        }
        this.addError(errorMetadata)
        return [
            {
                startIndex: error.index,
                length: error[0].length,
                tooltip: 'Help Me Fix',
                query,
            },
        ]
    }

    private async showNotification(query: Query): Promise<void> {
        const mute = 'Do not show again'
        const yes = 'Yes'
        const no = 'No'
        const items = [yes, no, mute]
        telemetry.mynah_viewNotification.emit({
            mynahContext: JSON.stringify({
                notificationMetadata: {
                    name: TERMINAL_ERROR_NOTIFICATION,
                },
            }),
        })
        const result = await window.showInformationMessage(
            'Mynah search is available to help resolve the error. Would you like to see the results?',
            ...items
        )

        telemetry.mynah_actOnNotification.emit({
            mynahContext: JSON.stringify({
                notificationMetadata: {
                    name: TERMINAL_ERROR_NOTIFICATION,
                    action: result,
                },
            }),
        })

        switch (result) {
            case yes:
                this.queryEmitter.fire(query)
                break
            case no:
                break
            case mute:
                await this.notificationInfoStore.setMuteStatusForNotificationInWorkplaceStore(
                    TERMINAL_ERROR_NOTIFICATION,
                    true
                )
                break
            default:
                break
        }
    }

    handleTerminalLink(link: SearchTerminalLink): void {
        this.queryEmitter.fire(link.query)
    }

    private isNewError(errorMetadata: ErrorMetadata): boolean {
        return !Object.prototype.hasOwnProperty.call(this.errorCache, errorMetadata.message)
    }

    private addError(errorMetadata: ErrorMetadata): void {
        this.errorCache[errorMetadata.message] = true
    }
}
