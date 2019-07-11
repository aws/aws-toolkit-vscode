/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as del from 'del'
import * as path from 'path'
import * as filesystemUtilities from './filesystemUtilities'
import * as l from './logger'

export class TestLogger {
    /**
     * initializes a default logger. This persists through all tests.
     * initializing a default logger means that any tested files with logger statements will work.
     * as a best practice, please initialize a TestLogger before running tests on a file with logger statements.
     *
     * @param logFolder - Folder to be managed by this object. Will be deleted on cleanup
     * @param logger - Logger to work with
     */
    private constructor(
        private readonly logFolder: string,
        private readonly logger: l.Logger
    ) { }

    // cleanupLogger clears out the logger's transports, but the logger will still exist as a default
    // this means that the default logger will still work for other files but will output an error
    public async cleanupLogger(): Promise<void> {
        this.logger.releaseLogger()
        if (await filesystemUtilities.fileExists(this.logFolder)) {
            await del(this.logFolder, { force: true })
        }
    }

    public async logContainsText(str: string): Promise<boolean> {
        const logText = await filesystemUtilities.readFileAsString(TestLogger.getLogPath(this.logFolder))

        return logText.includes(str)
    }

    public static async createTestLogger(): Promise<TestLogger> {
        const logFolder = await filesystemUtilities.makeTemporaryToolkitFolder()
        const logger = await l.initialize({
            logPath: TestLogger.getLogPath(logFolder),
            logLevel: 'debug'
        })

        return new TestLogger(logFolder, logger)
    }

    private static getLogPath(logFolder: string): string {
        return path.join(logFolder, 'temp.log')
    }
}
