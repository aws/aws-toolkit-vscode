/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import { ChildProcessResult } from '../../utilities/childProcess'
import { DefaultSamCliProcessInvoker, SamCliProcessInvoker } from './samCliInvoker'

export class SamCliInfoInvocation {

    public constructor(
        private readonly invoker: SamCliProcessInvoker = new DefaultSamCliProcessInvoker()
    ) {
    }

    public async execute(): Promise<SamCliInfoResponse> {
        await this.validate()

        const { error, exitCode, stderr, stdout }: ChildProcessResult = await this.invoker.invoke('--info')

        if (exitCode === 0) {
            const response = this.convertOutput(stdout)

            if (!!response) {
                return response
            }

            throw new Error('SAM CLI did not return expected data')
        }

        console.error('SAM CLI error')
        console.error(`Exit code: ${exitCode}`)
        console.error(`Error: ${error}`)
        console.error(`stderr: ${stderr}`)
        console.error(`stdout: ${stdout}`)

        throw new Error(`sam --info encountered an error: ${error && error.message ? error.message : stderr || stdout}`)
    }

    /**
     * Parses the output into a typed object with expected data
     * @param text output from a `sam --info` call
     */
    protected convertOutput(text: string): SamCliInfoResponse | undefined {
        try {
            return JSON.parse(text) as SamCliInfoResponse
        } catch (err) {
            console.error(err)

            return undefined
        }
    }

    protected async validate(): Promise<void> {
    }
}

/**
 * Maps out the response text from the sam cli command `sam --info`
 */
export interface SamCliInfoResponse {
    version: string
}
