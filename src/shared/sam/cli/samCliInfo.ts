/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { getLogger, Logger } from '../../logger'
import { ChildProcess } from '../../utilities/childProcess'
import { logAndThrowIfUnexpectedExitCode } from './samCliInvokerUtils'

/**
 * Maps out the response text from the sam cli command `sam --info`
 */
export interface SamCliInfoResponse {
    version: string
}

export class SamCliInfoInvocation {
    public constructor(private readonly samPath: string) {}

    public async execute(): Promise<SamCliInfoResponse> {
        const childProcessResult = await new ChildProcess(this.samPath, ['--info'], { logging: 'no' }).run()

        logAndThrowIfUnexpectedExitCode(childProcessResult, 0)
        const response = this.convertOutput(childProcessResult.stdout)

        if (!response) {
            throw new Error('SAM CLI did not return expected data')
        }

        return response
    }

    /**
     * Parses the output into a typed object with expected data
     * @param text output from a `sam --info` call
     */
    protected convertOutput(text: string): SamCliInfoResponse | undefined {
        const logger: Logger = getLogger()
        try {
            return JSON.parse(text) as SamCliInfoResponse
        } catch (err) {
            logger.error(err as Error)

            return undefined
        }
    }
}
