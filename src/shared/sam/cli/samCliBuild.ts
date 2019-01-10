/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import { fileExists } from '../../filesystemUtilities'
import { ChildProcessResult } from '../../utilities/childProcess'
import { DefaultSamCliProcessInvoker, SamCliProcessInvoker } from './samCliInvoker'

export interface SamCliBuildResponse {
}

export class SamCliBuildInvocation {
    public constructor(
        private readonly buildDir: string,
        private readonly baseDir: string,
        private readonly templatePath: string,
        private readonly invoker: SamCliProcessInvoker = new DefaultSamCliProcessInvoker()
    ) {
    }

    public async execute(): Promise<SamCliBuildResponse> {
        await this.validate()

        const childProcessResult: ChildProcessResult = await this.invoker.invoke(
            'build',
            '--build-dir', this.buildDir,
            '--base-dir', this.baseDir,
            '--template', this.templatePath
        )

        if (childProcessResult.exitCode === 0) {
            const response: SamCliBuildResponse = {}

            return response
        }

        console.error('SAM CLI error')
        console.error(`Exit code: ${childProcessResult.exitCode}`)
        console.error(`Error: ${childProcessResult.error}`)
        console.error(`stdout: ${childProcessResult.stdout}`)

        let errorMessage: string | undefined
        if (!!childProcessResult.error && !!childProcessResult.error.message) {
            errorMessage = childProcessResult.error.message
        } else if (!!childProcessResult.stderr) {
            errorMessage = childProcessResult.stderr
        }
        throw new Error(`sam build encountered an error: ${errorMessage}`)
    }

    protected async validate(): Promise<void> {
        if (!this.buildDir) {
            throw new Error('buildDir is missing or empty')
        }

        if (!this.templatePath) {
            throw new Error('template path is missing or empty')
        }

        if (!await fileExists(this.templatePath)) {
            throw new Error(`template path does not exist: ${this.templatePath}`)
        }
    }
}
