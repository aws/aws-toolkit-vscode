/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { getLogger } from '../../shared/logger/logger'
import * as diffGenerator from './diffContextGenerator'
import * as codewhispererClient from '../client/codewhisperer'
import { predictionTrackerDefaultConfig } from '../models/constants'
import globals from '../../shared/extensionGlobals'

// defaul values are stored in codewhisperer/model/constants
export interface FileTrackerConfig {
    maxStorageSizeKb: number
    debounceIntervalMs: number
    maxAgeMs: number
    maxSupplementalContext: number
}

/**
 * Represents a snapshot of a file at a specific point in time
 */
export interface FileSnapshot {
    filePath: string
    size: number
    timestamp: number
    content: string
}

export class PredictionTracker {
    private snapshots: Map<string, FileSnapshot[]> = new Map()
    private logger = getLogger('nextEditPrediction')
    readonly config: FileTrackerConfig
    private storageSize: number = 0

    constructor(extensionContext: vscode.ExtensionContext, config?: Partial<FileTrackerConfig>) {
        this.config = {
            ...predictionTrackerDefaultConfig,
            ...config,
        }
    }

    /**
     * Processes an edit to a document and takes a snapshot if needed
     * @param document The document being edited
     * @param previousContent The content of the document before the edit
     */
    public async processEdit(document: vscode.TextDocument, previousContent: string): Promise<void> {
        const filePath = document.uri.fsPath

        try {
            // Get existing snapshots for this file
            const fileSnapshots = this.snapshots.get(filePath) || []
            const timestamp = globals.clock.Date.now()

            // Anti-throttling, only add snap shot after the debounce is cleared
            const shouldAddSnapshot =
                fileSnapshots.length === 0 ||
                timestamp - fileSnapshots[fileSnapshots.length - 1].timestamp > this.config.debounceIntervalMs

            if (!shouldAddSnapshot) {
                return
            }

            const content = previousContent
            const size = Buffer.byteLength(content, 'utf8')
            const snapshot: FileSnapshot = {
                filePath,
                size,
                timestamp,
                content,
            }

            fileSnapshots.push(snapshot)
            this.snapshots.set(filePath, fileSnapshots)
            this.storageSize += size
            this.logger.debug(
                `Snapshot taken for file: ${filePath}, total snapshots: ${this.getTotalSnapshotCount()}, total size: ${Math.round(this.storageSize / 1024)} KB`
            )

            await this.enforceMemoryLimits()
            this.enforceTimeLimits(snapshot)
        } catch (err) {
            this.logger.error(`Failed to save snapshot: ${err}`)
        }
    }

    /**
     * Sets up a timeout to delete the given snapshot after it exceeds the max age
     */
    private enforceTimeLimits(snapshot: FileSnapshot): void {
        const fileSnapshots = this.snapshots.get(snapshot.filePath)
        if (fileSnapshots === undefined) {
            return
        }

        setTimeout(() => {
            // find the snapshot and remove it
            const index = fileSnapshots.indexOf(snapshot)
            if (index !== -1) {
                fileSnapshots.splice(index, 1)
                this.storageSize -= snapshot.size
                if (fileSnapshots.length === 0) {
                    this.snapshots.delete(snapshot.filePath)
                }
                this.logger.debug(
                    `Snapshot deleted (aged out) for file: ${snapshot.filePath}, remaining snapshots: ${this.getTotalSnapshotCount()}, new size: ${Math.round(this.storageSize / 1024)} KB`
                )
            }
        }, this.config.maxAgeMs)
    }

    /**
     * Enforces memory limits by removing old snapshots if necessary
     */
    private async enforceMemoryLimits(): Promise<void> {
        while (this.storageSize > this.config.maxStorageSizeKb * 1024) {
            const oldestFile = this.findOldestFile()
            if (!oldestFile) {
                break
            }

            const fileSnapshots = this.snapshots.get(oldestFile)
            if (!fileSnapshots || fileSnapshots.length === 0) {
                this.snapshots.delete(oldestFile)
                continue
            }

            const removedSnapshot = fileSnapshots.shift()
            if (removedSnapshot) {
                this.storageSize -= removedSnapshot.size
                this.logger.debug(
                    `Snapshot deleted (memory limit) for file: ${removedSnapshot.filePath}, remaining snapshots: ${this.getTotalSnapshotCount()}, new size: ${Math.round(this.storageSize / 1024)} KB`
                )
            }

            if (fileSnapshots.length === 0) {
                this.snapshots.delete(oldestFile)
            }
        }
    }

    /**
     * Finds the file with the oldest snapshot
     * @returns The file path of the oldest snapshot
     */
    private findOldestFile(): string | undefined {
        let oldestTime = Number.MAX_SAFE_INTEGER
        let oldestFile: string | undefined

        for (const [filePath, snapshots] of this.snapshots.entries()) {
            if (snapshots.length === 0) {
                continue
            }

            const oldestSnapshot = snapshots[0]
            if (oldestSnapshot.timestamp < oldestTime) {
                oldestTime = oldestSnapshot.timestamp
                oldestFile = filePath
            }
        }

        return oldestFile
    }

    /**
     * Gets all snapshots for a specific file
     * @param filePath The path to the file
     * @returns Array of snapshots for the file
     */
    public getFileSnapshots(filePath: string): FileSnapshot[] {
        return this.snapshots.get(filePath) || []
    }

    /**
     * Gets all tracked files
     * @returns Array of file paths
     */
    public getTrackedFiles(): string[] {
        return Array.from(this.snapshots.keys())
    }

    public getTotalSnapshotCount(): number {
        return Array.from(this.snapshots.values()).reduce((count, snapshots) => count + snapshots.length, 0)
    }

    public async getSnapshotContent(snapshot: FileSnapshot): Promise<string> {
        return snapshot.content
    }

    /**
     * Generates unified diffs between adjacent snapshots of a file
     * and between the newest snapshot and the current file content
     *
     * @returns Array of SupplementalContext objects containing diffs between snapshots and current content
     */
    public async generatePredictionSupplementalContext(): Promise<codewhispererClient.SupplementalContext[]> {
        try {
            const activeEditor = vscode.window.activeTextEditor
            if (activeEditor === undefined) {
                return []
            }
            const filePath = activeEditor.document.uri.fsPath
            const currentContent = activeEditor.document.getText()
            const snapshots = this.getFileSnapshots(filePath)

            if (snapshots.length === 0) {
                return []
            }

            // Create SnapshotContent array from snapshots
            const snapshotContents: diffGenerator.SnapshotContent[] = snapshots.map((snapshot) => ({
                filePath: snapshot.filePath,
                content: snapshot.content,
                timestamp: snapshot.timestamp,
            }))

            // Use the diffGenerator module to generate supplemental contexts
            return diffGenerator.generateDiffContexts(
                filePath,
                currentContent,
                snapshotContents,
                this.config.maxSupplementalContext
            )
        } catch (err) {
            // this ensures we are not breaking inline requests
            this.logger.error(`Failed to generate prediction supplemental context: ${err}`)
            return []
        }
    }

    public getTotalSize() {
        return this.storageSize
    }
}
