/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
// eslint-disable-next-line no-restricted-imports
import * as fs from 'fs'
import * as path from 'path'
import * as assert from 'assert'
import { RotatingLogChannel } from '../lsp/rotatingLogChannel'

describe('RotatingLogChannel', () => {
    let testDir: string
    let mockExtensionContext: vscode.ExtensionContext
    let mockOutputChannel: vscode.LogOutputChannel
    let logChannel: RotatingLogChannel

    beforeEach(() => {
        // Create a temp test directory
        testDir = fs.mkdtempSync('amazonq-test-logs-')

        // Mock extension context
        mockExtensionContext = {
            storageUri: { fsPath: testDir } as vscode.Uri,
        } as vscode.ExtensionContext

        // Mock output channel
        mockOutputChannel = {
            name: 'Test Output Channel',
            append: () => {},
            appendLine: () => {},
            replace: () => {},
            clear: () => {},
            show: () => {},
            hide: () => {},
            dispose: () => {},
            trace: () => {},
            debug: () => {},
            info: () => {},
            warn: () => {},
            error: () => {},
            logLevel: vscode.LogLevel.Info,
            onDidChangeLogLevel: new vscode.EventEmitter<vscode.LogLevel>().event,
        }

        // Create log channel instance
        logChannel = new RotatingLogChannel('test', mockExtensionContext, mockOutputChannel)
    })

    afterEach(() => {
        // Cleanup test directory
        if (fs.existsSync(testDir)) {
            fs.rmSync(testDir, { recursive: true, force: true })
        }
    })

    it('creates log file on initialization', () => {
        const files = fs.readdirSync(testDir)
        assert.strictEqual(files.length, 1)
        assert.ok(files[0].startsWith('amazonq-lsp-'))
        assert.ok(files[0].endsWith('.log'))
    })

    it('writes logs to file', async () => {
        const testMessage = 'test log message'
        logChannel.info(testMessage)

        // Allow async operations to complete
        await new Promise((resolve) => setTimeout(resolve, 100))

        const files = fs.readdirSync(testDir)
        const content = fs.readFileSync(path.join(testDir, files[0]), 'utf-8')
        assert.ok(content.includes(testMessage))
    })

    it('rotates files when size limit is reached', async () => {
        // Write enough data to trigger rotation
        const largeMessage = 'x'.repeat(1024 * 1024) // 1MB
        for (let i = 0; i < 6; i++) {
            // Should create at least 2 files
            logChannel.info(largeMessage)
        }

        // Allow async operations to complete
        await new Promise((resolve) => setTimeout(resolve, 100))

        const files = fs.readdirSync(testDir)
        assert.ok(files.length > 1, 'Should have created multiple log files')
        assert.ok(files.length <= 4, 'Should not exceed max file limit')
    })

    it('keeps only the specified number of files', async () => {
        // Write enough data to create more than MAX_LOG_FILES
        const largeMessage = 'x'.repeat(1024 * 1024) // 1MB
        for (let i = 0; i < 20; i++) {
            // Should trigger multiple rotations
            logChannel.info(largeMessage)
        }

        // Allow async operations to complete
        await new Promise((resolve) => setTimeout(resolve, 100))

        const files = fs.readdirSync(testDir)
        assert.strictEqual(files.length, 4, 'Should keep exactly 4 files')
    })

    it('cleans up all files on dispose', async () => {
        // Write some logs
        logChannel.info('test message')

        // Allow async operations to complete
        await new Promise((resolve) => setTimeout(resolve, 100))

        // Verify files exist
        assert.ok(fs.readdirSync(testDir).length > 0)

        // Dispose
        logChannel.dispose()

        // Allow async operations to complete
        await new Promise((resolve) => setTimeout(resolve, 100))

        // Verify files are cleaned up
        const remainingFiles = fs.readdirSync(testDir).filter((f) => f.startsWith('amazonq-lsp-') && f.endsWith('.log'))
        assert.strictEqual(remainingFiles.length, 0, 'Should have no log files after disposal')
    })

    it('includes timestamps in log messages', async () => {
        const testMessage = 'test message'
        logChannel.info(testMessage)

        // Allow async operations to complete
        await new Promise((resolve) => setTimeout(resolve, 100))

        const files = fs.readdirSync(testDir)
        const content = fs.readFileSync(path.join(testDir, files[0]), 'utf-8')

        // ISO date format regex
        const timestampRegex = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/
        assert.ok(timestampRegex.test(content), 'Log entry should include ISO timestamp')
    })

    it('handles different log levels correctly', async () => {
        const testMessage = 'test message'
        logChannel.trace(testMessage)
        logChannel.debug(testMessage)
        logChannel.info(testMessage)
        logChannel.warn(testMessage)
        logChannel.error(testMessage)

        // Allow async operations to complete
        await new Promise((resolve) => setTimeout(resolve, 100))

        const files = fs.readdirSync(testDir)
        const content = fs.readFileSync(path.join(testDir, files[0]), 'utf-8')

        assert.ok(content.includes('[TRACE]'), 'Should include TRACE level')
        assert.ok(content.includes('[DEBUG]'), 'Should include DEBUG level')
        assert.ok(content.includes('[INFO]'), 'Should include INFO level')
        assert.ok(content.includes('[WARN]'), 'Should include WARN level')
        assert.ok(content.includes('[ERROR]'), 'Should include ERROR level')
    })

    it('delegates log level to the original channel', () => {
        // Set up a mock output channel with a specific log level
        const mockChannel = {
            ...mockOutputChannel,
            logLevel: vscode.LogLevel.Trace,
        }

        // Create a new log channel with the mock
        const testLogChannel = new RotatingLogChannel('test-delegate', mockExtensionContext, mockChannel)

        // Verify that the log level is delegated correctly
        assert.strictEqual(
            testLogChannel.logLevel,
            vscode.LogLevel.Trace,
            'Should delegate log level to original channel'
        )

        // Change the mock's log level
        mockChannel.logLevel = vscode.LogLevel.Debug

        // Verify that the change is reflected
        assert.strictEqual(
            testLogChannel.logLevel,
            vscode.LogLevel.Debug,
            'Should reflect changes to original channel log level'
        )
    })
})
