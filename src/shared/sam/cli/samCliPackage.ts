/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import { ChildProcessResult } from '../../utilities/childProcess'
import { DefaultSamCliProcessInvoker, SamCliProcessInvoker } from './samCliInvoker'

export class SamCliPackageInvocation {
    public constructor(
        private readonly templateFile: string,
        private readonly outputTemplateFile: string,
        private readonly s3Bucket: string,
        private readonly invoker: SamCliProcessInvoker = new DefaultSamCliProcessInvoker()
    ) {
    }

    public async execute(): Promise<void> {
        const { exitCode, error, stderr, stdout }: ChildProcessResult = await this.invoker.invoke(
            'package',
            '--template-file', this.templateFile,
            '--s3-bucket', this.s3Bucket,
            '--output-template-file', this.outputTemplateFile
        )

        if (exitCode === 0) {
            return
        }

        console.error('SAM package error')
        console.error(`Exit code: ${exitCode}`)
        console.error(`Error: ${error}`)
        console.error(`stderr: ${stderr}`)
        console.error(`stdout: ${stdout}`)

        const message = error && error.message ? error.message : stderr || stdout
        throw new Error(`sam package encountered an error: ${message}`)
    }
}
