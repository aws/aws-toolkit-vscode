/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { getLogger, Logger } from '../../logger'
import { ChildProcess } from '../../utilities/childProcess'

export interface SamCliInfoResponse {
    version: string
}

export class SamCliInfoInvocation {
    public constructor(private readonly samPath: string) {}

    public async execute(): Promise<SamCliInfoResponse> {
        const r = await new ChildProcess(this.samPath, ['--info'], { logging: 'no' }).run()

        if (r.exitCode !== 0) {
            // getVersionValidatorResult() will return `SamCliVersionValidation.VersionNotParseable`.
            return { version: '' }
        }
        const response = this.convertOutput(r.stdout)

        if (!response) {
            return { version: '' }
        }

        // Special case: fix sam cli "nightly" invalid semver version string.
        // Example: "1.86.1.dev202306120901"
        // https://github.com/aws/aws-sam-cli/releases/tag/sam-cli-nightly
        response.version = response.version.replace(/.dev/, '-dev')

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
