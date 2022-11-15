/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable @typescript-eslint/no-dynamic-delete */
/* eslint-disable @typescript-eslint/strict-boolean-expressions */
import { TextDocumentChangeEvent, workspace } from 'vscode'
import { TelemetryClientSession } from './telemetry/client'
import { TelemetryEventName } from './telemetry/types'

interface BufferedFileEdits {
    [stringUri: string]: {
        fileName: string
        firstModifiedAt: Date
        lastModifiedAt: Date
        editCount: number
    }
}

export class FileEditListener {
    private readonly bufferDuration: number

    private bufferedFileEdits: BufferedFileEdits = {}

    private readonly telemetryClientSession: TelemetryClientSession

    constructor(bufferDuration: number, telemetryClientSession: TelemetryClientSession) {
        this.bufferDuration = bufferDuration
        this.telemetryClientSession = telemetryClientSession
    }

    public activate(): void {
        workspace.onDidChangeTextDocument(event => {
            this.onDidChangeTextDocument(event)
        })
    }

    private onDidChangeTextDocument(event: TextDocumentChangeEvent): void {
        const bufferedEvent = this.bufferedFileEdits[event.document.uri.fsPath]
        if (!bufferedEvent) {
            this.bufferedFileEdits[event.document.uri.fsPath] = {
                fileName: event.document.uri.fsPath,
                firstModifiedAt: new Date(),
                lastModifiedAt: new Date(),
                editCount: 1,
            }
            setTimeout(() => {
                const bufferedEvent = this.bufferedFileEdits[event.document.uri.fsPath]
                this.telemetryClientSession.recordEvent(TelemetryEventName.EDIT_FILE, {
                    fileEditMetadata: bufferedEvent,
                })
                delete this.bufferedFileEdits[event.document.uri.fsPath]
            }, this.bufferDuration)
        } else {
            bufferedEvent.editCount = bufferedEvent.editCount + 1
            bufferedEvent.lastModifiedAt = new Date()
        }
    }
}
