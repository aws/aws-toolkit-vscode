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

export interface FileTrackerConfig {
    /** Maximum number of files to track (default: 15) */
    maxFiles: number
    /** Maximum total size of all snapshots in kilobytes (default: 200) */
    maxStorageSizeKb: number
    /** Debounce interval in milliseconds (default: 2000) */
    debounceIntervalMs: number
    /** Maximum age of snapshots in milliseconds (default: 30000) */
    maxAgeMs: number
    /** Maximum number of supplemental contexts to return (default: 15) */
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
    private storagePath?: string
    private debounceTracker: Set<string> = new Set()

    constructor(extensionContext: vscode.ExtensionContext, config?: Partial<FileTrackerConfig>) {
        this.config = {
            ...predictionTrackerDefaultConfig,
            ...config,
        }

        // Use workspace storage
        this.storagePath = extensionContext.storageUri?.fsPath

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
        const storageKey = `${filePath}-${timestamp}`

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

    /**
     * Gets the total number of snapshots across all files
     * @returns Total snapshot count
     */
    public getTotalSnapshotCount(): number {
        let count = 0
        for (const snapshots of this.snapshots.values()) {
            count += snapshots.length
        }
        return count
    }

    /**
     * Saves snapshot content to Storage
     * @param storageKey The storage key for the snapshot
     * @param content The content to save
     */
    private async saveSnapshotContentToStorage(storageKey: string, content: string): Promise<void> {
        if (!this.storagePath) {
            throw new Error('Storage path not available')
        }

        const snapshotsDir = path.join(this.storagePath, 'AmazonQ-file-snapshots')
        if (!(await fs.existsDir(snapshotsDir))) {
            await fs.mkdir(snapshotsDir)
        }

        const filePath = path.join(snapshotsDir, `${storageKey}.nep-snapshot`)
        await fs.writeFile(filePath, content)
    }

    private async deleteSnapshot(snapshot: FileSnapshot): Promise<void> {
        if (!this.storagePath) {
            return
        }

        // Update the storage size
        this.storageSize -= snapshot.size

        const snapshotsDir = path.join(this.storagePath, 'AmazonQ-file-snapshots')
        const filePath = path.join(snapshotsDir, `${snapshot.storageKey}.nep-snapshot`)

        if (await fs.exists(filePath)) {
            try {
                await fs.delete(filePath)
            } catch (err) {
                getLogger().error(`Failed to delete snapshot from Storage: ${err}`)
            }
        }
    }

    /**
     * Loads snapshot content from Storage
     * @param snapshot The snapshot metadata
     * @returns The string content of the snapshot
     */
    public async getSnapshotContent(snapshot: FileSnapshot): Promise<string> {
        if (!this.storagePath) {
            throw new Error('Storage path not available')
        }

        const snapshotsDir = path.join(this.storagePath, 'AmazonQ-file-snapshots')
        const filePath = path.join(snapshotsDir, `${snapshot.storageKey}.nep-snapshot`)

        try {
            return await fs.readFileText(filePath)
        } catch (err) {
            getLogger().error(`Failed to read snapshot content from Storage: ${err}`)
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
            try {
                const content = await this.getSnapshotContent(snapshot)
                snapshotContents.push({
                    filePath: snapshot.filePath,
                    content,
                    timestamp: snapshot.timestamp,
                })
            } catch (err) {
                getLogger().error(`Failed to load snapshot content: ${err}`)
            }
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
        if (!this.storagePath) {
            return
        }

        const snapshotsDir = path.join(this.storagePath, 'AmazonQ-file-snapshots')
        if (!(await fs.existsDir(snapshotsDir))) {
            await fs.mkdir(snapshotsDir)
        }
    }

    private async loadSnapshotsFromStorage(): Promise<void> {
        if (!this.storagePath) {
            return
        }

        const snapshotsDir = path.join(this.storagePath, 'AmazonQ-file-snapshots')
        if (!(await fs.existsDir(snapshotsDir))) {
            return
        }

        try {
            const files = await fs.readdir(snapshotsDir)
            const metadataFiles = new Map<string, { timestamp: number; filePath: string }>()

            // First, collect all the metadata files
            for (const [filename, fileType] of files) {
                if (!filename.endsWith('.nep-snapshot') || fileType !== vscode.FileType.File) {
                    continue
                }

                const storageKey = filename.substring(0, filename.length - '.nep-snapshot'.length)
                const parts = storageKey.split('-')
                const timestamp = parseInt(parts[parts.length - 1], 10)
                const originalFilename = parts.slice(0, parts.length - 1).join('-')

                // This helps us match the files back to their original source
                metadataFiles.set(storageKey, {
                    timestamp,
                    filePath: originalFilename,
                })
            }

            // Now process each file that we found
            for (const [storageKey, metadata] of metadataFiles.entries()) {
                const contentPath = path.join(snapshotsDir, `${storageKey}.nep-snapshot`)

                try {
                    // if original file no longer exists, delete the snapshot
                    if (!(await fs.exists(metadata.filePath))) {
                        await fs.delete(contentPath)
                        continue
                    }

                    // Calculate size from the content file
                    const stats = await fs.stat(contentPath)
                    const size = stats.size

                    // Create a metadata-only snapshot
                    const snapshot: FileSnapshot = {
                        filePath: metadata.filePath,
                        timestamp: metadata.timestamp,
                        size,
                        storageKey,
                    }

                    // Add to memory tracking
                    const fileSnapshots = this.snapshots.get(metadata.filePath) || []
                    fileSnapshots.push(snapshot)
                    this.snapshots.set(metadata.filePath, fileSnapshots)
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

    /**
     * Disposes of resources used by the tracker
     */
    public dispose(): void {
        this.debounceTracker.clear()
    }
}
