/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as path from 'path'
import fs from '../../shared/fs/fs'
import { getLogger } from '../../shared/logger/logger'
import * as diffGenerator from './diffContextGenerator'
import * as codewhispererClient from '../client/codewhisperer'
import { predictionTrackerDefaultConfig } from '../models/constants'

const snapshotDirName = 'AmazonQ-file-snapshots'
const snapshotFileSuffix = '.nep-snapshot'

// defaul values are stored in codewhisperer/model/constants
export interface FileTrackerConfig {
    maxFiles: number
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
    storageKey: string
}

export class PredictionTracker {
    private snapshots: Map<string, FileSnapshot[]> = new Map()
    readonly config: FileTrackerConfig
    private storageSize: number = 0
    private storagePath: string

    constructor(extensionContext: vscode.ExtensionContext, config?: Partial<FileTrackerConfig>) {
        this.config = {
            ...predictionTrackerDefaultConfig,
            ...config,
        }

        this.storagePath = extensionContext.storageUri?.fsPath as string

        void this.ensureStorageDirectoryExists()
        void this.loadSnapshotsFromStorage()
    }

    public processEdit(document: vscode.TextDocument, previousContent: string): void {
        const filePath = document.uri.fsPath
        getLogger().debug(`Processing edit for file: ${filePath}`)

        if (!this.storagePath || !document.uri.scheme.startsWith('file')) {
            return
        }

        void this.takeSnapshot(filePath, previousContent)
    }

    /**
     * Takes a snapshot with provided previous content
     * @param filePath The path with of document
     * @param previousContent It's content before the edit
     */
    private async takeSnapshot(filePath: string, previousContent: string): Promise<void> {
        const content = previousContent
        const size = Buffer.byteLength(content, 'utf8')

        const timestamp = Date.now()
        const storageKey = `${filePath.replace(/\//g, '__')}-${timestamp}`

        const snapshot: FileSnapshot = {
            filePath,
            size,
            timestamp,
            storageKey,
        }

        // Get existing snapshots for this file
        const fileSnapshots = this.snapshots.get(filePath) || []

        // Check if we should add a new snapshot given the debounce
        const shouldAddSnapshot =
            fileSnapshots.length === 0 ||
            timestamp - fileSnapshots[fileSnapshots.length - 1].timestamp > this.config.debounceIntervalMs

        if (shouldAddSnapshot) {
            try {
                // Save to workspace storage
                await this.saveSnapshotContentToStorage(storageKey, content)

                fileSnapshots.push(snapshot)
                this.snapshots.set(filePath, fileSnapshots)
                this.storageSize += size

                await this.enforceMemoryLimits()

                // Set a timeout to delete the snapshot after maxAgeMs
                setTimeout(async () => {
                    const index = fileSnapshots.indexOf(snapshot)
                    if (index !== -1) {
                        fileSnapshots.splice(index, 1)
                        await this.deleteSnapshot(snapshot)
                        if (fileSnapshots.length === 0) {
                            this.snapshots.delete(filePath)
                        }
                    }
                }, this.config.maxAgeMs)
            } catch (err) {
                getLogger().error(`Failed to save snapshot to Storage: ${err}`)
            }
        }
    }

    /**
     * Enforces memory limits by removing old snapshots if necessary
     */
    private async enforceMemoryLimits(): Promise<void> {
        // Enforce total size limit
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
                await this.deleteSnapshot(removedSnapshot)
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
     * Removes snapshots that are older than the maximum age
     */
    private cleanupOldSnapshots(): void {
        const now = Date.now()
        const maxAge = this.config.maxAgeMs

        for (const [filePath, snapshots] of this.snapshots.entries()) {
            const validSnapshots = snapshots.filter((snapshot) => {
                const isValid = now - snapshot.timestamp <= maxAge
                if (!isValid) {
                    void this.deleteSnapshot(snapshot)
                }
                return isValid
            })

            if (validSnapshots.length === 0) {
                this.snapshots.delete(filePath)
            } else {
                this.snapshots.set(filePath, validSnapshots)
            }
        }
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

    private getSnapshotsDirectoryPath(): string {
        return path.join(this.storagePath, snapshotDirName)
    }

    private getSnapshotFilePath(storageKey: string): string {
        const snapshotsDir = this.getSnapshotsDirectoryPath()
        return path.join(snapshotsDir, `${storageKey}${snapshotFileSuffix}`)
    }

    /**
     * Saves snapshot content to Storage
     * @param storageKey The storage key for the snapshot
     * @param content The content to save
     */
    private async saveSnapshotContentToStorage(storageKey: string, content: string): Promise<void> {
        const filePath = this.getSnapshotFilePath(storageKey)
        if (!filePath) {
            throw new Error('Failed to create snapshot file path')
        }

        try {
            await fs.writeFile(filePath, content)
        } catch (err) {
            getLogger().error(`Failed to write snapshot to Storage: ${err}`)
        }
    }

    private async deleteSnapshot(snapshot: FileSnapshot): Promise<void> {
        if (!this.storagePath) {
            return
        }

        this.storageSize -= snapshot.size
        const filePath = this.getSnapshotFilePath(snapshot.storageKey)

        try {
            await fs.delete(filePath)
        } catch (err) {
            getLogger().error(`Failed to delete snapshot from Storage: ${err}`)
        }
    }

    /**
     * Loads snapshot content from Storage
     * @param snapshot The snapshot metadata
     * @returns The string content of the snapshot
     */
    public async getSnapshotContent(snapshot: FileSnapshot): Promise<string> {
        const filePath = this.getSnapshotFilePath(snapshot.storageKey)

        try {
            return await fs.readFileText(filePath)
        } catch (err) {
            throw new Error(`Failed to read snapshot content: ${err}`)
        }
    }

    /**
     * Generates unified diffs between adjacent snapshots of a file
     * and between the newest snapshot and the current file content
     *
     * @returns Array of SupplementalContext objects containing diffs between snapshots and current content
     */
    public async generatePredictionSupplementalContext(): Promise<codewhispererClient.SupplementalContext[]> {
        const activeEditor = vscode.window.activeTextEditor
        if (activeEditor === undefined) {
            return []
        }
        const filePath = activeEditor.document.uri.fsPath
        const currentContent = activeEditor.document.getText()

        // Get all snapshots for this file
        const snapshots = this.getFileSnapshots(filePath)

        if (snapshots.length === 0) {
            return []
        }

        // Load all snapshot contents
        const snapshotContents: diffGenerator.SnapshotContent[] = []
        for (const snapshot of snapshots) {
            const content = await this.getSnapshotContent(snapshot)
            snapshotContents.push({
                filePath: snapshot.filePath,
                content,
                timestamp: snapshot.timestamp,
            })
        }

        // Use the diffGenerator module to generate supplemental contexts
        return diffGenerator.generateDiffContexts(
            filePath,
            currentContent,
            snapshotContents,
            this.config.maxSupplementalContext
        )
    }

    private async ensureStorageDirectoryExists(): Promise<void> {
        const snapshotsDir = this.getSnapshotsDirectoryPath()

        if (!(await fs.existsDir(snapshotsDir))) {
            await fs.mkdir(snapshotsDir)
        }
    }

    private async loadSnapshotsFromStorage(): Promise<void> {
        const snapshotsDir = this.getSnapshotsDirectoryPath()
        if (!(await fs.existsDir(snapshotsDir))) {
            return
        }

        try {
            const files = await fs.readdir(snapshotsDir)

            // Process each file in a single pass
            for (const [filename, fileType] of files) {
                if (!filename.endsWith(snapshotFileSuffix) || fileType !== vscode.FileType.File) {
                    continue
                }

                const storageKey = filename.substring(0, filename.length - snapshotFileSuffix.length)
                const parts = storageKey.split('-')
                const timestamp = parseInt(parts[parts.length - 1], 10)
                // Rejoin to get file path without timestamp
                const sanitizedFilename = parts.slice(0, parts.length - 1).join('-')
                const originalFilename = sanitizedFilename.replace(/__/g, '/')
                const contentPath = this.getSnapshotFilePath(storageKey)

                try {
                    // If original file no longer exists, delete the snapshot
                    if (!(await fs.exists(originalFilename))) {
                        await fs.delete(contentPath)
                        continue
                    }

                    const stats = await fs.stat(contentPath)
                    const size = stats.size

                    const snapshot: FileSnapshot = {
                        filePath: originalFilename,
                        timestamp,
                        size,
                        storageKey,
                    }

                    const fileSnapshots = this.snapshots.get(originalFilename) || []
                    fileSnapshots.push(snapshot)
                    this.snapshots.set(originalFilename, fileSnapshots)
                    this.storageSize += size
                } catch (err) {
                    // Remove invalid files
                    getLogger().error(`Error processing snapshot file ${storageKey}: ${err}`)
                    await fs.delete(contentPath)
                }
            }

            // Sort snapshots by timestamp
            for (const [filePath, snapshots] of this.snapshots.entries()) {
                this.snapshots.set(
                    filePath,
                    snapshots.sort((a, b) => a.timestamp - b.timestamp)
                )
            }

            // Apply memory limits after loading
            await this.enforceMemoryLimits()
            this.cleanupOldSnapshots()

            getLogger().info(`Loaded ${this.getTotalSnapshotCount()} snapshots for ${this.snapshots.size} files`)
        } catch (err) {
            getLogger().error(`Failed to load snapshots from Storage: ${err}`)
        }
    }

    public getTotalSize() {
        return this.storageSize
    }
}
