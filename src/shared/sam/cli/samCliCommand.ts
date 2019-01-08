/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import { extensionSettingsPrefix } from '../../constants'
import { DefaultSettingsConfiguration } from '../../settingsConfiguration'
import { ChildProcess, ChildProcessResult } from '../../utilities/childProcess'
import { SamCliConfiguration } from './samCliConfiguration'
import { DefaultSamCliLocationProvider } from './samCliLocator'

/**
 * Represents a call to sam cli
 * Callers are expected to ensure SAM CLI is installed and has been configured
 */
export abstract class SamCliCommand<T> {

    private readonly _samCliLocation: string | undefined

    protected constructor(config: SamCliConfiguration) {
        this._samCliLocation = config.getSamCliLocation()
    }

    public abstract execute(): Thenable<T>

    protected get samCliLocation(): string {
        if (!this._samCliLocation) {
            throw new Error('SAM CLI location not configured')
        }

        return this._samCliLocation
    }

    /**
     * Ensures the command is properly set up to run, throws Error if not.
     * Derived classes should likely call validate at the start of their execute implementations.
     */
    protected async validate(): Promise<void> {
        if (!this._samCliLocation) {
            throw new Error('SAM CLI location not configured')
        }
    }
}

export class SamCliInfoCommand extends SamCliCommand<SamCliInfoResponse> {

    public constructor(config: SamCliConfiguration = new SamCliConfiguration(
        new DefaultSettingsConfiguration(extensionSettingsPrefix),
        new DefaultSamCliLocationProvider()
    )) {
        super(config)
    }

    public async execute(): Promise<SamCliInfoResponse> {
        await this.validate()

        const childProcess: ChildProcess = new ChildProcess(
            this.samCliLocation,
            ['--info']
        )

        childProcess.start()

        const childProcessResult: ChildProcessResult = await childProcess.promise()

        if (childProcessResult.exitCode === 0) {
            const response = this.convertOutput(childProcessResult.stdout)

            if (!!response) {
                return response
            }

            throw new Error('SAM CLI did not return expected data')
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
        throw new Error(`sam --info encountered an error: ${errorMessage}`)
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
}

/**
 * Maps out the response text from the sam cli command `sam --info`
 */
export interface SamCliInfoResponse {
    version: string
}
