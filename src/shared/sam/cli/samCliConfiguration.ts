/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as filesystemUtilities from '../../filesystemUtilities'
import { SettingsConfiguration } from '../../settingsConfiguration'
import { SamCliLocationProvider } from './samCliLocator'

export interface SamCliConfiguration {
    getSamCliLocation(): string | undefined

    setSamCliLocation(location: string | undefined): Promise<void>

    initialize(): Promise<void>
}

export class DefaultSamCliConfiguration implements SamCliConfiguration {
    public static readonly CONFIGURATION_KEY_SAMCLI_LOCATION: string = 'samcli.location'
    private readonly _configuration: SettingsConfiguration
    private readonly _samCliLocationProvider: SamCliLocationProvider

    public constructor(configuration: SettingsConfiguration, samCliLocationProvider: SamCliLocationProvider) {
        this._configuration = configuration
        this._samCliLocationProvider = samCliLocationProvider
    }

    /** Gets the current SAM CLI location from the VSCode settings store. */
    public getSamCliLocation(): string | undefined {
        return this._configuration.readSetting<string>(DefaultSamCliConfiguration.CONFIGURATION_KEY_SAMCLI_LOCATION)
    }

    /** Sets the SAM CLI location in the VSCode settings store. */
    public async setSamCliLocation(location: string | undefined): Promise<void> {
        await this._configuration.writeSetting(
            DefaultSamCliConfiguration.CONFIGURATION_KEY_SAMCLI_LOCATION,
            location,
            vscode.ConfigurationTarget.Global
        )
    }

    /**
     * Initializes this SamCliConfiguration object from the VSCode user settings,
     * or tries to auto-detect `sam` in the environment.
     */
    public async initialize(): Promise<void> {
        const configLocation = this.getSamCliLocation() ?? ''
        if (configLocation) {
            if (await filesystemUtilities.fileExists(configLocation)) {
                return
            }
        }

        const detectedLocation = (await this._samCliLocationProvider.getLocation()) ?? ''
        // Avoid setting the value redundantly (could cause a loop because we
        // listen to the `onDidChangeConfiguration` event).
        if (detectedLocation && configLocation !== detectedLocation) {
            await this.setSamCliLocation(detectedLocation)
        }
    }
}
