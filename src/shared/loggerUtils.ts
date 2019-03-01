/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as del from 'del'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import * as filesystemUtilities from './filesystemUtilities'
import * as l from './logger'

export class TestLogger {
    private readonly _logger: l.Logger
    private readonly _logfile: string

    // initializes a default logger. This persists through all tests.
    // default logger means that any tested files with logger statements will work.
    // as a best practice, please initialize a TestLogger before running tests on a file with logger statements.
    public constructor() {
        this._logfile = fs.mkdtempSync(path.join(os.tmpdir(), 'vsctk'))
        this._logger = l.initialize({
            logPath: path.join(this._logfile, 'temp.log'),
            logLevel: 'debug'
        })
    }

    // cleanupLogger clears out the logger's transports, but the logger will still exist as a default
    // this means that the default logger will still work for other files but will output an error
    public async cleanupLogger(): Promise<void> {
        this._logger.releaseLogger()
        if (await filesystemUtilities.fileExists(this._logfile)) {
            await del(this._logfile, { force: true })
        }
    }

    public async logContainsText(str: string): Promise<boolean> {
        const logText = await filesystemUtilities.readFileAsString(this._logfile as string)

        return(logText.includes(str))
    }
}
