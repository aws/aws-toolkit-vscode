/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Disposable, window, workspace } from 'vscode'
import { telemetry } from '../../shared/telemetry/telemetry'
import { HeartbeatMetadata } from '../telemetry/telemetry-metadata'

const HeartbeatDueThreshold = 120000

export class HeartbeatListener {
    private disposable!: Disposable

    private lastFileName!: string

    private lastHeartbeatAt = 0

    constructor() {
        this.setupEventListeners()
    }

    private setupEventListeners(): void {
        const subscriptions: Disposable[] = []
        window.onDidChangeTextEditorSelection(this.onView.bind(this), this, subscriptions)
        window.onDidChangeActiveTextEditor(this.onView.bind(this), this, subscriptions)
        workspace.onDidSaveTextDocument(this.onEdit.bind(this), this, subscriptions)

        this.disposable = Disposable.from(...subscriptions)
    }

    private onView(): void {
        this.onEvent(false)
    }

    private onEdit(): void {
        this.onEvent(true)
    }

    private onEvent(isEdit: boolean): void {
        const editor = window.activeTextEditor
        if (editor !== undefined) {
            const doc = editor.document
            if (doc.fileName.length > 0) {
                const now = Date.now()
                if (isEdit || this.isHeartbeatDue(now) || this.lastFileName !== doc.fileName) {
                    this.sendHeartbeat(doc.fileName, doc.languageId, isEdit)
                    this.lastFileName = doc.fileName
                    this.lastHeartbeatAt = now
                }
            }
        }
    }

    private isHeartbeatDue(time: number): boolean {
        return this.lastHeartbeatAt + HeartbeatDueThreshold < time
    }

    private sendHeartbeat(fileName: string, languageId: string, isEdit: boolean): void {
        const heartbeatMetadata: HeartbeatMetadata = {
            fileName,
            languageId,
            isEdit,
        }
        telemetry.mynah_heartbeat.emit({
            mynahContext: JSON.stringify({
                heartbeatMetadata,
            }),
        })
    }

    public dispose(): void {
        this.disposable.dispose()
    }
}
