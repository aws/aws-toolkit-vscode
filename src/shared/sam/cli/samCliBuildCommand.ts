/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import { extensionSettingsPrefix } from '../../constants'
import { fileExists } from '../../filesystemUtilities'
import { DefaultSettingsConfiguration } from '../../settingsConfiguration'
import { ChildProcess, ChildProcessResult } from '../../utilities/childProcess'
import { SamCliCommand } from './samCliCommand'
import { SamCliConfiguration } from './samCliConfiguration'
import { DefaultSamCliLocationProvider } from './samCliLocator'

export interface SamCliBuildCommandResponse {
}

export class SamCliBuildCommand extends SamCliCommand<SamCliBuildCommandResponse> {
    private readonly _buildDir: string
    private readonly _baseDir: string
    private readonly _templatePath: string

    public constructor(
        buildDir: string,
        baseDir: string,
        templatePath: string,
        config: SamCliConfiguration = new SamCliConfiguration(
            new DefaultSettingsConfiguration(extensionSettingsPrefix),
            new DefaultSamCliLocationProvider()
        )) {
        super(config)
        this._buildDir = buildDir
        this._baseDir = baseDir
        this._templatePath = templatePath
    }

    public async execute(): Promise<SamCliBuildCommandResponse> {
        await this.validate()

        const childProcess: ChildProcess = new ChildProcess(
            this.samCliLocation!,
            [
                'build',
                '--build-dir', this._buildDir,
                '--base-dir', this._baseDir,
                '--template', this._templatePath,
            ]
        )

        childProcess.start()

        const childProcessResult: ChildProcessResult = await childProcess.promise()

        if (childProcessResult.exitCode === 0) {
            const response: SamCliBuildCommandResponse = {}

            return response
        }

        // tslint:disable-next-line:max-line-length
        console.error(`SAM CLI error\nExit code: ${childProcessResult.exitCode}\nError: ${childProcessResult.error}\nstdout: ${childProcessResult.stdout}`)

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

        if (!this._buildDir) {
            throw new Error('buildDir is missing or empty')
        }

        if (!this._templatePath) {
            throw new Error('template path is missing or empty')
        }

        if (!await fileExists(this._templatePath)) {
            throw new Error(`template path does not exist: ${this._templatePath}`)
        }
    }
}
