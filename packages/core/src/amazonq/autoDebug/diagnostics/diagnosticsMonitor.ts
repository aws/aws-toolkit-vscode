/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { getLogger } from '../../../shared/logger/logger'
import { ToolkitError } from '../../../shared/errors'

export interface DiagnosticCollection {
    readonly diagnostics: [vscode.Uri, vscode.Diagnostic[]][]
    readonly timestamp: number
}

export interface DiagnosticSnapshot {
    readonly diagnostics: DiagnosticCollection
    readonly captureTime: number
    readonly id: string
}

export interface FileDiagnostics {
    readonly uri: vscode.Uri
    readonly diagnostics: vscode.Diagnostic[]
}

/**
 * Monitors IDE diagnostic changes in real-time using language server protocols.
 * Implements smart filtering and debounced event handling to avoid excessive API calls.
 */
export class DiagnosticsMonitor implements vscode.Disposable {
    private readonly logger = getLogger('amazonqLsp')
    private readonly diagnosticsChangeEmitter = new vscode.EventEmitter<DiagnosticCollection>()
    private readonly disposables: vscode.Disposable[] = []
    private lastDiagnostics: DiagnosticCollection | undefined
    private debounceTimer: NodeJS.Timeout | undefined
    private readonly debounceDelayMs = 500

    public readonly onDiagnosticsChanged = this.diagnosticsChangeEmitter.event

    constructor() {
        // Monitor diagnostic changes from all language servers
        this.disposables.push(
            vscode.languages.onDidChangeDiagnostics((event) => {
                this.logger.debug('DiagnosticsMonitor: Diagnostic change detected for %d URIs', event.uris.length)
                this.handleDiagnosticChange(event)
            })
        )

        this.disposables.push(this.diagnosticsChangeEmitter)
    }

    /**
     * Gets current diagnostics with optional waiting for changes
     */
    public async getCurrentDiagnostics(shouldWaitForChanges: boolean = false): Promise<DiagnosticCollection> {
        const currentDiagnostics = this.collectAllDiagnostics()

        if (!shouldWaitForChanges) {
            this.lastDiagnostics = currentDiagnostics
            return currentDiagnostics
        }

        // Check if diagnostics have changed since last collection
        if (!this.lastDiagnostics || !this.areDiagnosticsEqual(this.lastDiagnostics, currentDiagnostics)) {
            this.lastDiagnostics = currentDiagnostics
            return currentDiagnostics
        }

        // Wait for diagnostic updates with timeout
        return this.waitForUpdatedDiagnostics(5000) // 5 second timeout
    }

    /**
     * Filters diagnostics by source (TypeScript, ESLint, etc.)
     */
    public filterBySource(diagnostics: DiagnosticCollection, sources: string[]): DiagnosticCollection {
        const filteredDiagnostics: [vscode.Uri, vscode.Diagnostic[]][] = []

        for (const [uri, fileDiagnostics] of diagnostics.diagnostics) {
            const filtered = fileDiagnostics.filter(
                (diagnostic) => !diagnostic.source || sources.includes(diagnostic.source)
            )

            if (filtered.length > 0) {
                filteredDiagnostics.push([uri, filtered])
            }
        }

        return {
            diagnostics: filteredDiagnostics,
            timestamp: diagnostics.timestamp,
        }
    }

    /**
     * Filters diagnostics by severity level
     */
    public filterBySeverity(
        diagnostics: DiagnosticCollection,
        severities: vscode.DiagnosticSeverity[]
    ): DiagnosticCollection {
        const filteredDiagnostics: [vscode.Uri, vscode.Diagnostic[]][] = []

        for (const [uri, fileDiagnostics] of diagnostics.diagnostics) {
            const filtered = fileDiagnostics.filter((diagnostic) => severities.includes(diagnostic.severity))

            if (filtered.length > 0) {
                filteredDiagnostics.push([uri, filtered])
            }
        }

        return {
            diagnostics: filteredDiagnostics,
            timestamp: diagnostics.timestamp,
        }
    }

    /**
     * Captures a baseline snapshot of current diagnostics
     */
    public async captureBaseline(): Promise<DiagnosticSnapshot> {
        this.logger.debug('DiagnosticsMonitor: Capturing diagnostic baseline')

        const diagnostics = await this.getCurrentDiagnostics(false)
        const snapshot: DiagnosticSnapshot = {
            diagnostics,
            captureTime: Date.now(),
            id: this.generateSnapshotId(),
        }

        this.logger.debug(
            'DiagnosticsMonitor: Captured baseline with %d files, id=%s',
            diagnostics.diagnostics.length,
            snapshot.id
        )

        return snapshot
    }

    /**
     * Gets only error-level diagnostics for critical issue detection
     */
    public getErrorDiagnostics(diagnostics: DiagnosticCollection): DiagnosticCollection {
        return this.filterBySeverity(diagnostics, [vscode.DiagnosticSeverity.Error])
    }

    /**
     * Gets warning-level diagnostics
     */
    public getWarningDiagnostics(diagnostics: DiagnosticCollection): DiagnosticCollection {
        return this.filterBySeverity(diagnostics, [vscode.DiagnosticSeverity.Warning])
    }

    private handleDiagnosticChange(event: vscode.DiagnosticChangeEvent): void {
        // Debounce diagnostic changes to avoid excessive processing
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer)
        }

        this.debounceTimer = setTimeout(() => {
            this.processDiagnosticChange(event)
        }, this.debounceDelayMs)
    }

    private processDiagnosticChange(event: vscode.DiagnosticChangeEvent): void {
        try {
            const currentDiagnostics = this.collectAllDiagnostics()

            // Only emit if diagnostics actually changed
            if (!this.lastDiagnostics || !this.areDiagnosticsEqual(this.lastDiagnostics, currentDiagnostics)) {
                this.logger.debug('DiagnosticsMonitor: Emitting diagnostic change event')
                this.lastDiagnostics = currentDiagnostics
                this.diagnosticsChangeEmitter.fire(currentDiagnostics)
            }
        } catch (error) {
            this.logger.error('DiagnosticsMonitor: Error processing diagnostic change: %s', error)
        }
    }

    private collectAllDiagnostics(): DiagnosticCollection {
        const allDiagnostics: [vscode.Uri, vscode.Diagnostic[]][] = []

        // Get diagnostics from all sources
        for (const [uri, diagnostics] of vscode.languages.getDiagnostics()) {
            if (diagnostics.length > 0) {
                allDiagnostics.push([uri, diagnostics])
            }
        }

        return {
            diagnostics: allDiagnostics,
            timestamp: Date.now(),
        }
    }

    private async waitForUpdatedDiagnostics(timeoutMs: number): Promise<DiagnosticCollection> {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                disposable.dispose()
                reject(
                    new ToolkitError('Timeout waiting for diagnostic updates', {
                        code: 'DiagnosticTimeout',
                        details: { timeoutMs },
                    })
                )
            }, timeoutMs)

            const disposable = this.onDiagnosticsChanged((diagnostics) => {
                clearTimeout(timeout)
                disposable.dispose()
                resolve(diagnostics)
            })
        })
    }

    private areDiagnosticsEqual(a: DiagnosticCollection, b: DiagnosticCollection): boolean {
        if (a.diagnostics.length !== b.diagnostics.length) {
            return false
        }

        // Simple comparison - could be optimized for performance
        const aStr = JSON.stringify(a.diagnostics.map(([uri, diags]) => [uri.toString(), diags]))
        const bStr = JSON.stringify(b.diagnostics.map(([uri, diags]) => [uri.toString(), diags]))

        return aStr === bStr
    }

    private generateSnapshotId(): string {
        return `snapshot_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    }

    public dispose(): void {
        this.logger.debug('DiagnosticsMonitor: Disposing diagnostic monitor')

        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer)
        }

        vscode.Disposable.from(...this.disposables).dispose()
    }
}
