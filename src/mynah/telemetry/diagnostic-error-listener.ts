/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable @typescript-eslint/strict-boolean-expressions */
import { Diagnostic, DiagnosticChangeEvent, languages, Position, Range, TextEditor, Uri, window } from 'vscode'
import { getErrorId, getDiagnosticErrorCode } from '../utils/diagnostic'
import { TelemetryClientSession } from './telemetry/client'
import { ErrorType, TelemetryEventName } from './telemetry/types'

/**
 * A diagnostic moves from TRANSIENT to PERSISTENT state if it lasts for more than the time specified in the delay.
 */
enum DiagnosticState {
    TRANSIENT,
    PERSISTENT,
}

interface CachedDiagnostic {
    [stringUri: string]: {
        [diagnosticId: string]: {
            diagnostic: Diagnostic
            state: DiagnosticState
        }
    }
}

export class DiagnosticErrorListener {
    /**
     * Delay in milli-seconds after which a telemetry error event is recorded. The delay is added to prevent recording transient errors.
     */
    private readonly delay: number

    /**
     * Cached diagnostics error messages for each URI.
     */
    private diagnosticCache: CachedDiagnostic = {}

    constructor(delay: number, readonly telemetrySession: TelemetryClientSession) {
        this.delay = delay
    }

    public activate(): void {
        languages.onDidChangeDiagnostics(event => this.onChangedDiagnostics(event))
    }

    private onChangedDiagnostics(diagnosticChangeEvent: DiagnosticChangeEvent): void {
        const visibleDocumentPaths: string[] = window.visibleTextEditors.map(editor => editor.document.uri.fsPath)
        const visibleUrisWithDiagnosticErrors = diagnosticChangeEvent.uris.filter(uri =>
            visibleDocumentPaths.includes(uri.fsPath)
        )
        for (const uri of visibleUrisWithDiagnosticErrors) {
            const seenDiagnostics = this.diagnosticCache[uri.fsPath] ?? {}
            if (!Object.prototype.hasOwnProperty.call(this.diagnosticCache, uri.fsPath)) {
                this.diagnosticCache[uri.fsPath] = seenDiagnostics
            }
            const currentDiagnostics: { [key: string]: Diagnostic } = languages
                .getDiagnostics(uri)
                .reduce((o, key) => ({ ...o, [this.getDiagnosticId(key)]: key }), {})
            const currentDiagnosticIds = Object.keys(currentDiagnostics)
            const seenDiagnosticIds = Object.keys(seenDiagnostics) ?? []

            const newDiagnosticIds: string[] = []
            for (const key of currentDiagnosticIds) {
                if (!seenDiagnosticIds.includes(key)) {
                    newDiagnosticIds.push(key)
                }
            }

            const clearedDiagnosticIds: string[] = []
            for (const key of seenDiagnosticIds) {
                if (!currentDiagnosticIds.includes(key)) {
                    clearedDiagnosticIds.push(key)
                }
            }

            const editor = window.visibleTextEditors.find(editor => editor.document.uri.fsPath === uri.fsPath)
            setTimeout(() => {
                for (const key of newDiagnosticIds) {
                    if (seenDiagnostics[key]) {
                        // Validate that error still exists
                        seenDiagnostics[key].state = DiagnosticState.PERSISTENT
                        const diagnostic = seenDiagnostics[key].diagnostic
                        this.telemetrySession.recordEvent(TelemetryEventName.OBSERVE_ERROR, {
                            errorMetadata: this.getErrorMetadata(diagnostic, uri, editor),
                        })
                    }
                }
            }, this.delay)

            for (const key of newDiagnosticIds) {
                seenDiagnostics[key] = { diagnostic: currentDiagnostics[key], state: DiagnosticState.TRANSIENT }
                if (!this.diagnosticCache[uri.fsPath]) {
                    this.diagnosticCache[uri.fsPath] = seenDiagnostics
                }
            }

            for (const key of clearedDiagnosticIds) {
                const clearedDiagnostic = seenDiagnostics[key]
                if (clearedDiagnostic.state === DiagnosticState.PERSISTENT) {
                    this.telemetrySession.recordEvent(TelemetryEventName.CLEAR_ERROR, {
                        errorMetadata: this.getErrorMetadata(clearedDiagnostic.diagnostic, uri, editor),
                    })
                }
                // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
                delete seenDiagnostics[key]
            }
        }
    }

    private getDiagnosticId(diagnostic: Diagnostic): string {
        return `${getDiagnosticErrorCode(diagnostic)} : ${diagnostic.message}`
    }

    // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
    private getErrorMetadata(diagnostic: Diagnostic, uri: Uri, editor?: TextEditor) {
        const relevantLine = diagnostic.range.start.line
        const codeRange = new Range(new Position(Math.max(0, relevantLine - 1), 0), new Position(relevantLine + 1, 0))
        const errorCode: string = getDiagnosticErrorCode(diagnostic)
        return {
            message: diagnostic.message,
            severity: diagnostic.severity.toString(),
            source: diagnostic.source,
            errorCode,
            code: editor?.document.getText(codeRange) ?? '',
            errorId: getErrorId(diagnostic, uri.fsPath),
            file: uri.fsPath,
            languageId: editor?.document.languageId,
            type: ErrorType.DIAGNOSTIC,
        }
    }
}
