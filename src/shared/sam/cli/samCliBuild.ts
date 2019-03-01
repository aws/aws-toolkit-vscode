/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import { fileExists } from '../../filesystemUtilities'
import { getLogger, Logger } from '../../logger'
import { ChildProcessResult } from '../../utilities/childProcess'
import { DefaultSamCliProcessInvoker, SamCliProcessInvoker } from './samCliInvoker'

export class SamCliBuildInvocation {
    public constructor(
        private readonly buildDir: string,
        private readonly baseDir: string,
        private readonly templatePath: string,
        private readonly invoker: SamCliProcessInvoker = new DefaultSamCliProcessInvoker()
    ) {
    }

    public async execute(): Promise<void> {
        const logger: Logger = getLogger()
        await this.validate()

        const { exitCode, error, stderr, stdout }: ChildProcessResult = await this.invoker.invoke(
            'build',
            '--build-dir', this.buildDir,
            '--base-dir', this.baseDir,
            '--template', this.templatePath
        )

        if (exitCode === 0) {
            return
        }

        console.error('SAM CLI error')
        console.error(`Exit code: ${exitCode}`)
        console.error(`Error: ${error}`)
        console.error(`stderr: ${stderr}`)
        console.error(`stdout: ${stdout}`)

        const err =
            new Error(`sam build encountered an error: ${error && error.message ? error.message : stderr || stdout}`)
        logger.error(err)
        throw err
    }

    private async validate(): Promise<void> {
        const logger: Logger = getLogger()
        if (!await fileExists(this.templatePath)) {
            const err = new Error(`template path does not exist: ${this.templatePath}`)
            logger.error(err)
            throw err
        }
    }
}
