/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { SettingsConfiguration } from '../../settingsConfiguration'
import { SamCliLocationProvider } from './samCliLocator'

export interface SamCliConfiguration {
    /** Gets the current SAM CLI location from the VSCode settings store. */
    getSamCliLocation(): string | undefined

    /** Sets the SAM CLI location in the VSCode settings store. */
    setSamCliLocation(location: string | undefined): Promise<void>

    /**
     * Initializes this SamCliConfiguration object from the VSCode user settings,
     * or tries to auto-detect `sam` in the environment.
     *
     * @returns true if auto-detection failed; false if auto-detection succeeded or was not attempted.
     */
    initialize(): Promise<void>

    /**
     * Gets location of `sam` from user config, or tries to find `sam` on the
     * system if the user config is invalid.
     *
     * @returns empty string if `sam` was not found on the system
     */
    getOrDetectSamCli(): Promise<{ path: string; autoDetected: boolean }>
}

export class DefaultSamCliConfiguration implements SamCliConfiguration {
    public static readonly CONFIGURATION_KEY_SAMCLI_LOCATION: string = 'samcli.location'
    private readonly _configuration: SettingsConfiguration
    private readonly _samCliLocationProvider: SamCliLocationProvider

    public constructor(configuration: SettingsConfiguration, samCliLocationProvider: SamCliLocationProvider) {
        this._configuration = configuration
        this._samCliLocationProvider = samCliLocationProvider
    }

    public getSamCliLocation(): string | undefined {
        return this._configuration.readSetting<string>(DefaultSamCliConfiguration.CONFIGURATION_KEY_SAMCLI_LOCATION)
    }

    public async setSamCliLocation(location: string | undefined): Promise<void> {
        await this._configuration.writeSetting(
            DefaultSamCliConfiguration.CONFIGURATION_KEY_SAMCLI_LOCATION,
            location,
            vscode.ConfigurationTarget.Global
        )
    }

    /**
     * Gets the `samcli.location` setting if set by the user, else searches for
     * `sam` on the system and returns the result.
     *
     * Returns `autoDetected=true` if auto-detection was _attempted_. If `sam`
     * was not found on the system then `path=""`.
     */
    public async getOrDetectSamCli(): Promise<{ path: string; autoDetected: boolean }> {
        const fromConfig =
            this._configuration.readSetting<string>(DefaultSamCliConfiguration.CONFIGURATION_KEY_SAMCLI_LOCATION) ?? ''
        // Respect user setting, do not validate it. fileExists() does not
        // understand WSL paths, for example.  https://github.com/aws/aws-toolkit-vscode/issues/1300
        if (fromConfig) {
            return { path: fromConfig, autoDetected: false }
        }
        const fromSearch = (await this._samCliLocationProvider.getLocation()) ?? ''
        return { path: fromSearch, autoDetected: true }
    }

    // TODO: remove this, it's only used by tests. Maybe the tests can call
    // detectSamCli() instead, or likely the tests need to be revisited entirely.
    public async initialize(): Promise<void> {
        const samPath = await this.getOrDetectSamCli()
        if (!samPath.autoDetected) {
            return
        }

        await this.setSamCliLocation(samPath.path)
    }
}
