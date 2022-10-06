/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    EventEmitter,
    ExtensionContext,
    debug,
    DebugAdapterTrackerFactory,
    window,
    DebugAdapterTracker,
    ProviderResult,
    DiagnosticSeverity,
} from 'vscode'
import { DebugProtocol } from '@vscode/debugprotocol'
import { findErrorContext } from '../utils/stack-trace'
import { v4 as uuid } from 'uuid'
import { ExceptionInfoResponse } from './interfaces'
import { extractLanguageAndOtherContext } from './languages'
import { TelemetryClientSession } from '../telemetry/telemetry/client'
import { ErrorType, TelemetryEventName } from '../telemetry/telemetry/types'
import { LiveSearchDisplay } from '../views/live-search'
import { Query, QueryContext } from '../models/model'

export class DebugErrorSearch implements DebugAdapterTrackerFactory {
    constructor(
        readonly queryEmitter: EventEmitter<Query>,
        readonly telemetrySession: TelemetryClientSession,
        readonly liveSearchDisplay: LiveSearchDisplay
    ) {}

    public activate(context: ExtensionContext): void {
        context.subscriptions.push(debug.registerDebugAdapterTrackerFactory('*', this))
    }

    createDebugAdapterTracker(session: any): ProviderResult<DebugErrorSearchTracker> {
        return new DebugErrorSearchTracker(session, this.queryEmitter, this.telemetrySession, this.liveSearchDisplay)
    }
}

class DebugErrorSearchTracker implements DebugAdapterTracker {
    private readonly language?: string

    constructor(
        session: any,
        readonly queryEmitter: EventEmitter<Query>,
        readonly telemetrySession: TelemetryClientSession,
        readonly liveSearchDisplay: LiveSearchDisplay
    ) {
        this.language = session.type
    }

    async onDidSendMessage(msg: DebugProtocol.Response): Promise<void> {
        if (msg.type === 'response' && msg.command === 'exceptionInfo') {
            const exceptionInfo = msg as ExceptionInfoResponse
            const stackTrace = exceptionInfo.body.details?.stackTrace
            const errorContext = await findErrorContext(stackTrace, this.language)
            let code
            const { language, otherContext } = extractLanguageAndOtherContext(this.language)
            const queryContext: QueryContext = {
                must: [],
                should: otherContext,
                mustNot: [],
            }
            if (language !== undefined) {
                queryContext.must.push(language)
            }
            if (errorContext !== undefined) {
                code = errorContext.code
                queryContext.should.push(...errorContext.imports)
            }
            const errorMetadata = {
                // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
                message: `${msg.body.exceptionId} ${msg.body.description}`,
                severity: DiagnosticSeverity.Error.toString(),
                code: errorContext?.code,
                errorId: uuid(),
                file: errorContext?.file ?? '',
                languageId: language ?? '',
                stackTrace: stackTrace ?? '',
                type: ErrorType.DEBUG,
            }

            this.telemetrySession.recordEvent(TelemetryEventName.OBSERVE_ERROR, {
                errorMetadata,
            })

            const query: Query = {
                input: errorMetadata.message,
                code,
                queryContext,
                queryId: uuid(),
                trigger: 'DebugError',
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

            if (await this.liveSearchDisplay.canShowLiveSearchPane()) {
                this.queryEmitter.fire({ ...query, implicit: true })
                await this.liveSearchDisplay.incrementLiveSearchViewCount()
            } else {
                await this.askForConsent(query)
            }
        }
    }

    private async askForConsent(query: Query): Promise<void> {
        const notificationName = 'debug_error_search_consent'
        const no = 'No'
        const yes = 'Yes'
        const items = [yes, no]

        this.telemetrySession.recordEvent(TelemetryEventName.VIEW_NOTIFICATION, {
            notificationMetadata: {
                name: notificationName,
            },
        })

        const result = await window.showInformationMessage(
            'Mynah search is available to debug the exception. Would you like to see the results?',
            ...items
        )
        if (result === yes) {
            this.queryEmitter.fire(query)
        }
        this.telemetrySession.recordEvent(TelemetryEventName.CLICK_NOTIFICATION, {
            notificationMetadata: {
                name: notificationName,
                action: result,
            },
        })
    }
}
