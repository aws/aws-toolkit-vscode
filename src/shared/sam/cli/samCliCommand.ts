/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as nls from 'vscode-nls'
import { extensionSettingsPrefix } from '../../constants'
import { DefaultSettingsConfiguration } from '../../settingsConfiguration'
import { SamCliConfiguration } from './samCliConfiguration'
import { DefaultSamCliLocationProvider } from './samCliLocator'
import { SamCliProcess } from './samCliProcess'

const localize = nls.loadMessageBundle()

/**
 * Represents a call to sam cli
 */
export class SamCliCommand {

    private static SAM_CLI_CONFIGURATION: SamCliConfiguration | undefined
    private readonly _command: string
    private readonly _args: string[] | undefined

    public constructor(
        args?: string[]
    ) {
        this._command = SamCliCommand.getSamExecutablePath()
        this._args = args
    }

    /**
     * Creates an object to invoke and manage the sam cli call
     */
    public asSamCliProcess(): SamCliProcess {
        return new SamCliProcess(
            this._command,
            this._args
        )
    }

    // TODO : In the future when we hook up local lambda invokes, implement asTask() here, creating vscode.Task objs.

    private static getSamExecutablePath(): string {
        const samCliConfig: SamCliConfiguration = this.getSamCliConfiguration()

        const samCliLocation: string | undefined = samCliConfig.getSamCliLocation()

        if (!samCliLocation) {
            throw new Error(
                localize(
                    'AWS.samcli.error.notFound.brief',
                    'Could not get SAM CLI location'
                )
            )
        }

        return samCliLocation
    }

    private static getSamCliConfiguration(): SamCliConfiguration {
        if (!this.SAM_CLI_CONFIGURATION) {
            this.SAM_CLI_CONFIGURATION = new SamCliConfiguration(
                new DefaultSettingsConfiguration(extensionSettingsPrefix),
                new DefaultSamCliLocationProvider()
            )
        }

        return this.SAM_CLI_CONFIGURATION
    }
}

/**
 * Represents the `sam --info` call
 */
export class SamInfoCliCommand extends SamCliCommand {
    public constructor() {
        super(['--info'])
    }

    /**
     * Parses the output into a typed object with expected data
     * @param text output from a `sam --info` call
     */
    public static convertOutput(text: string): SamCliInfoResponse | undefined {
        try {
            return JSON.parse(text) as SamCliInfoResponse
        } catch (err) {
            console.log(err)

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
