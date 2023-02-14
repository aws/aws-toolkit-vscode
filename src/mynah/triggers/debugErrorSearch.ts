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
import { LiveSearchDisplay } from '../views/live-search'
import { Query } from '../models/model'
import { telemetry } from '../../shared/telemetry/telemetry'
import { ErrorMetadata, ErrorState, ErrorType, NotificationMetadata } from '../telemetry/telemetry-metadata'

export class DebugErrorSearch implements DebugAdapterTrackerFactory {
    constructor(readonly queryEmitter: EventEmitter<Query>, readonly liveSearchDisplay: LiveSearchDisplay) {}

    public activate(context: ExtensionContext): void {
        context.subscriptions.push(debug.registerDebugAdapterTrackerFactory('*', this))
    }

    createDebugAdapterTracker(session: any): ProviderResult<DebugErrorSearchTracker> {
        return new DebugErrorSearchTracker(session, this.queryEmitter, this.liveSearchDisplay)
    }
}

class DebugErrorSearchTracker implements DebugAdapterTracker {
    private readonly language?: string

    constructor(
        session: any,
        readonly queryEmitter: EventEmitter<Query>,
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
            const queryContext = {
                must: new Set<string>(),
                should: otherContext,
                mustNot: new Set<string>(),
            }
            if (language !== undefined) {
                queryContext.must.add(language)
            }
            if (errorContext !== undefined) {
                code = errorContext.code
                errorContext.imports.forEach(importKey => queryContext.should.add(importKey))
            }
            const errorMetadata: ErrorMetadata = {
                // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
                message: `${msg.body.exceptionId} ${msg.body.description}`,
                severity: DiagnosticSeverity.Error.toString(),
                code: errorContext?.code,
                errorId: uuid(),
                file: errorContext?.file ?? '',
                languageId: language ?? '',
                stackTrace: stackTrace ?? '',
                type: ErrorType.DEBUG,
                state: ErrorState.NEW,
            }

            telemetry.mynah_updateErrorState.emit({
                mynahContext: JSON.stringify({
                    errorMetadata,
                }),
            })

            const query: Query = {
                input: errorMetadata.message,
                code,
                queryContext: {
                    must: Array.from(queryContext.must),
                    should: Array.from(queryContext.should),
                    mustNot: Array.from(queryContext.mustNot),
                },
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
        let notificationMetadata: NotificationMetadata = {
            name: notificationName,
        }
        telemetry.mynah_viewNotification.emit({
            mynahContext: JSON.stringify({
                notificationMetadata,
            }),
        })
        const result = await window.showInformationMessage(
            'Mynah search is available to debug the exception. Would you like to see the results?',
            ...items
        )
        if (result === yes) {
            this.queryEmitter.fire(query)
        }
        notificationMetadata = {
            name: notificationName,
            action: result,
        }
        telemetry.mynah_actOnNotification.emit({
            mynahContext: JSON.stringify({
                notificationMetadata,
            }),
        })
    }
}
