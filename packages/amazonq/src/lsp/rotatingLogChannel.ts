/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as path from 'path'
import * as fs from 'fs' // eslint-disable-line no-restricted-imports
import { getLogger } from 'aws-core-vscode/shared'

export class RotatingLogChannel implements vscode.LogOutputChannel {
    private fileStream: fs.WriteStream | undefined
    private originalChannel: vscode.LogOutputChannel
    private logger = getLogger('amazonqLsp')
    private _logLevel: vscode.LogLevel = vscode.LogLevel.Info
    private currentFileSize = 0
    // eslint-disable-next-line @typescript-eslint/naming-convention
    private readonly MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB
    // eslint-disable-next-line @typescript-eslint/naming-convention
    private readonly MAX_LOG_FILES = 4

    constructor(
        public readonly name: string,
        private readonly extensionContext: vscode.ExtensionContext,
        outputChannel: vscode.LogOutputChannel
    ) {
        this.originalChannel = outputChannel
        this.initFileStream()
    }

    private async cleanupOldLogs(): Promise<void> {
        try {
            const logDir = this.extensionContext.storageUri?.fsPath
            if (!logDir) {
                return
            }

            // Get all log files
            const files = await fs.promises.readdir(logDir)
            const logFiles = files
                .filter((f) => f.startsWith('amazonq-lsp-') && f.endsWith('.log'))
                .map((f) => ({
                    name: f,
                    path: path.join(logDir, f),
                    time: fs.statSync(path.join(logDir, f)).mtime.getTime(),
                }))
                .sort((a, b) => b.time - a.time) // Sort newest to oldest

            // Remove all but the most recent MAX_LOG_FILES files
            for (const file of logFiles.slice(this.MAX_LOG_FILES - 1)) {
                try {
                    await fs.promises.unlink(file.path)
                    this.logger.debug(`Removed old log file: ${file.path}`)
                } catch (err) {
                    this.logger.error(`Failed to remove old log file ${file.path}: ${err}`)
                }
            }
        } catch (err) {
            this.logger.error(`Failed to cleanup old logs: ${err}`)
        }
    }

    private getLogFilePath(): string {
        const logDir = this.extensionContext.storageUri?.fsPath
        if (!logDir) {
            throw new Error('No storage URI available')
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '-').replace('Z', '')
        return path.join(logDir, `amazonq-lsp-${timestamp}.log`)
    }

    private async rotateLog(): Promise<void> {
        try {
            // Close current stream
            if (this.fileStream) {
                this.fileStream.end()
            }

            // Create new log file
            const newLogPath = this.getLogFilePath()
            this.fileStream = fs.createWriteStream(newLogPath, { flags: 'a' })
            this.currentFileSize = 0

            // Clean up old files
            await this.cleanupOldLogs()

            this.logger.info(`Created new log file: ${newLogPath}`)
        } catch (err) {
            this.logger.error(`Failed to rotate log file: ${err}`)
        }
    }

    private initFileStream() {
        try {
            const logDir = this.extensionContext.storageUri
            if (!logDir) {
                this.logger.error('Failed to get storage URI for logs')
                return
            }

            // Ensure directory exists
            if (!fs.existsSync(logDir.fsPath)) {
                fs.mkdirSync(logDir.fsPath, { recursive: true })
            }

            const logPath = this.getLogFilePath()
            this.fileStream = fs.createWriteStream(logPath, { flags: 'a' })
            this.currentFileSize = 0
            this.logger.info(`Logging to file: ${logPath}`)
        } catch (err) {
            this.logger.error(`Failed to create log file: ${err}`)
        }
    }

    get logLevel(): vscode.LogLevel {
        return this._logLevel
    }

    get onDidChangeLogLevel(): vscode.Event<vscode.LogLevel> {
        return this.originalChannel.onDidChangeLogLevel
    }

    trace(message: string, ...args: any[]): void {
        this.originalChannel.trace(message, ...args)
        this.writeToFile(`[TRACE] ${message}`)
    }

    debug(message: string, ...args: any[]): void {
        this.originalChannel.debug(message, ...args)
        this.writeToFile(`[DEBUG] ${message}`)
    }

    info(message: string, ...args: any[]): void {
        this.originalChannel.info(message, ...args)
        this.writeToFile(`[INFO] ${message}`)
    }

    warn(message: string, ...args: any[]): void {
        this.originalChannel.warn(message, ...args)
        this.writeToFile(`[WARN] ${message}`)
    }

    error(message: string | Error, ...args: any[]): void {
        this.originalChannel.error(message, ...args)
        this.writeToFile(`[ERROR] ${message instanceof Error ? message.stack || message.message : message}`)
    }

    append(value: string): void {
        this.originalChannel.append(value)
        this.writeToFile(value)
    }

    appendLine(value: string): void {
        this.originalChannel.appendLine(value)
        this.writeToFile(value + '\n')
    }

    replace(value: string): void {
        this.originalChannel.replace(value)
        this.writeToFile(`[REPLACE] ${value}`)
    }

    clear(): void {
        this.originalChannel.clear()
    }

    show(preserveFocus?: boolean): void
    show(column?: vscode.ViewColumn, preserveFocus?: boolean): void
    show(columnOrPreserveFocus?: vscode.ViewColumn | boolean, preserveFocus?: boolean): void {
        if (typeof columnOrPreserveFocus === 'boolean') {
            this.originalChannel.show(columnOrPreserveFocus)
        } else {
            this.originalChannel.show(columnOrPreserveFocus, preserveFocus)
        }
    }

    hide(): void {
        this.originalChannel.hide()
    }

    dispose(): void {
        // First dispose the original channel
        this.originalChannel.dispose()

        // Close our file stream if it exists
        if (this.fileStream) {
            this.fileStream.end()
        }

        // Clean up all log files
        const logDir = this.extensionContext.storageUri?.fsPath
        if (logDir) {
            try {
                const files = fs.readdirSync(logDir)
                for (const file of files) {
                    if (file.startsWith('amazonq-lsp-') && file.endsWith('.log')) {
                        fs.unlinkSync(path.join(logDir, file))
                    }
                }
                this.logger.info('Cleaned up all log files during disposal')
            } catch (err) {
                this.logger.error(`Failed to cleanup log files during disposal: ${err}`)
            }
        }
    }

    private writeToFile(content: string): void {
        if (this.fileStream) {
            try {
                const timestamp = new Date().toISOString()
                const logLine = `${timestamp} ${content}\n`
                const size = Buffer.byteLength(logLine)

                // If this write would exceed max file size, rotate first
                if (this.currentFileSize + size > this.MAX_FILE_SIZE) {
                    void this.rotateLog()
                }

                this.fileStream.write(logLine)
                this.currentFileSize += size
            } catch (err) {
                this.logger.error(`Failed to write to log file: ${err}`)
                void this.rotateLog()
            }
        }
    }
}
