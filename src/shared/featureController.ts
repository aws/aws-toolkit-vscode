/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { SettingsConfiguration } from './settingsConfiguration'

// This enum represents the list of active feature flags to check for
// Features all need to be added with matching enums and string values
// e.g. `Feature1 = 'Feature1'`
// Features that do not follow this scheme will not work.
// You cannot have more active features than FeatureController.maxFeatures (default: 5)
// Any features that are flagged in the code but not added here will always return false.
export enum ActiveFeatureKeys {
}

/**
 * This class handles feature access for unreleased or gated features.
 * Example: adding a feature called `NewFeature1`:
 *
 * Add the following to the `featureController.ActiveFeatureKeys` enum:
 *
 * ```
 * export enum ActiveFeatureKeys {
 *     NewFeature1 = 'NewFeature1'
 * }
 * ```
 *
 * You can then gate your feature with the following code (returning a boolean):
 *
 * ```
 * FeatureController.isFeatureActive(featureController.ActiveFeatureKeys.NewFeature1)
 * ```
 *
 * Finally, you can access the gated feature by adding the following snippet to the VS Code `settings.json` file:
 *
 * ```
 *     "aws.experimentalFeatureFlags": [
 *         "NewFeature1",
 *     ],
 * ```
 */
export class FeatureController {

    private readonly permanentSettings: Set<string>

    private readonly maxFeatures: number = 5

    public constructor (
        private readonly configuration: SettingsConfiguration,
        private readonly overrideKeys?: string[]
    ) {
        this.permanentSettings = new Set()

        let keys: string[] = []

        if (this.overrideKeys) {
            keys = this.overrideKeys
        } else {
            keys = Object.keys(ActiveFeatureKeys)
        }

        if (keys.length > 5) {
            throw new Error(
                `Amount of active feature flags (${keys.length}) exceeds maximum allowed (${this.maxFeatures}).`
            )
        }

        const settingsArr = this.configuration.readSetting('experimentalFeatureFlags')

        if (Array.isArray(settingsArr)) {
            for (const setting of settingsArr) {
                // check for string as settings.json does not enforce types
                if (typeof setting === 'string' && keys.indexOf(setting) >= 0) {
                    this.permanentSettings.add(setting)
                }
            }
        }
    }

    /**
     * Returns a boolean on whether or not to display a feature
     * @param key Feature key to search for
     */
    public isFeatureActive(key: string): boolean {
        return this.permanentSettings.has(key)
    }
}
