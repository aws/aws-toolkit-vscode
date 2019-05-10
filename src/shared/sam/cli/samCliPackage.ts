/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import { extensionSettingsPrefix, profileSettingKey } from '../../../shared/constants'
import { DefaultSettingsConfiguration } from '../../../shared/settingsConfiguration'
import { getLogger, Logger } from '../../logger'
import { ChildProcessResult } from '../../utilities/childProcess'
import { DefaultSamCliProcessInvoker } from './samCliInvoker'
import { SamCliProcessInvoker } from './samCliInvokerUtils'

export class SamCliPackageInvocation {
    public constructor(
        private readonly templateFile: string,
        private readonly outputTemplateFile: string,
        private readonly s3Bucket: string,
        private readonly invoker: SamCliProcessInvoker =
        new DefaultSamCliProcessInvoker(),
        private readonly region: string
    ) {
    }

    public async execute(): Promise<void> {
        const logger: Logger = getLogger()
        let err: Error
        const settingsConfiguration = new DefaultSettingsConfiguration(extensionSettingsPrefix)
        const profile = settingsConfiguration.readSetting<string>(profileSettingKey)

        if (!profile) {
            err = new Error('No AWS profile selected')
            logger.error(err)
            throw err
        }

        const { exitCode, error, stderr, stdout }: ChildProcessResult = await this.invoker.invoke(
            'package',
            '--template-file', this.templateFile,
            '--s3-bucket', this.s3Bucket,
            '--output-template-file', this.outputTemplateFile,
            '--region', this.region,
            '--profile', profile
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
        err = new Error(`sam package encountered an error: ${message}`)
        logger.error(err)
        throw err
    }
}
