/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { EnvironmentVariables } from './environmentVariables'

export class SystemUtilities {
    public static getHomeDirectory(): string {
        const env = process.env as EnvironmentVariables

        if (env.HOME !== undefined) { return env.HOME }
        if (env.USERPROFILE !== undefined) { return env.USERPROFILE }
        if (env.HOMEPATH !== undefined) {
            const homeDrive: string = env.HOMEDRIVE || 'C:'

            return path.join(homeDrive, env.HOMEPATH)
        }

        return os.homedir()
    }

    public static fileExists(file: string): boolean {
        try {
            fs.accessSync(file, fs.constants.F_OK)

            return true
        } catch (err) {
            return false
        }
    }
}
