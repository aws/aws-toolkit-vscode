/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import { extensionSettingsPrefix } from '../../constants'
import { fileExists } from '../../filesystemUtilities'
import { DefaultSettingsConfiguration } from '../../settingsConfiguration'
import { ChildProcess, ChildProcessResult } from '../../utilities/childProcess'
import { SamCliConfiguration } from './samCliConfiguration'
import { SamCliInvocation } from './samCliInvocation'
import { DefaultSamCliLocationProvider } from './samCliLocator'

export interface SamCliBuildResponse {
}

export class SamCliBuildInvocation extends SamCliInvocation<SamCliBuildResponse> {
    public constructor(
        private readonly buildDir: string,
        private readonly baseDir: string,
        private readonly templatePath: string,
        config: SamCliConfiguration = new SamCliConfiguration(
            new DefaultSettingsConfiguration(extensionSettingsPrefix),
            new DefaultSamCliLocationProvider()
        )) {
        super(config)
    }

    public async execute(): Promise<SamCliBuildResponse> {
        await this.validate()

        const childProcess: ChildProcess = new ChildProcess(
            this.samCliLocation,
            [
                'build',
                '--build-dir', this.buildDir,
                '--base-dir', this.baseDir,
                '--template', this.templatePath,
            ]
        )

        childProcess.start()

        const childProcessResult: ChildProcessResult = await childProcess.promise()

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
        await super.validate()

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
