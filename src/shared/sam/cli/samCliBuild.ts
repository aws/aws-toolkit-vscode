/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import { fileExists } from '../../filesystemUtilities'
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
        console.error(`stdout: ${stderr}`)
        console.error(`stdout: ${stdout}`)

        throw new Error(`sam build encountered an error: ${error && error.message ? error.message : stderr || stdout}`)
    }

    private async validate(): Promise<void> {
        if (!await fileExists(this.templatePath)) {
            throw new Error(`template path does not exist: ${this.templatePath}`)
        }
    }
}
