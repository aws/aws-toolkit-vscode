/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as del from 'del'
import * as path from 'path'
import * as filesystemUtilities from './filesystemUtilities'
import { initialize } from './logger/activation'
import { WinstonToolkitLogger } from './logger/winstonToolkitLogger'

export class TestLogger {
    /**
     * initializes a default logger. This persists through all tests.
     * initializing a default logger means that any tested files with logger statements will work.
     * Initialize a TestLogger before testing code that logs, and call cleanupLogger afterwards.
     *
     * @param logFolder - Folder to be managed by this object. Will be deleted on cleanup
     * @param logger - Logger to work with
     */
    private constructor(private readonly logFolder: string, private readonly logger: WinstonToolkitLogger) {}

    public async cleanupLogger(): Promise<void> {
        this.logger.dispose()
        if (await filesystemUtilities.fileExists(this.logFolder)) {
            await del(this.logFolder, { force: true })
        }
    }

    public get logPath(): string {
        return TestLogger.getLogPath(this.logFolder)
    }

    public static async createTestLogger(): Promise<TestLogger> {
        const logFolder = await filesystemUtilities.makeTemporaryToolkitFolder()
        const logger = await initialize({
            logPath: TestLogger.getLogPath(logFolder),
            logLevel: 'debug'
        })

        // In a future change, we will introduce a memory-based logger for testing usage.
        // For now, we rely on (and expect) a winston logger that is writing to a test log file.
        if (logger instanceof WinstonToolkitLogger) {
            return new TestLogger(logFolder, logger)
        }

        throw new Error('This test logger was expecting a Winston Toolkit Logger')
    }

    private static getLogPath(logFolder: string): string {
        return path.join(logFolder, 'temp.log')
    }
}
