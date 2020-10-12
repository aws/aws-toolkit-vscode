/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { extensionSettingsPrefix } from './constants'
import { SettingsConfiguration, DefaultSettingsConfiguration } from './settingsConfiguration'

/**
 * This enum represents the list of active feature flags to check for
 * Features all need to be added with matching enums and string values
 * e.g. `Feature1 = 'Feature1'`
 * Features that do not follow this scheme will not work.
 * You cannot have more active features than FeatureToggle.maxFeatures (default: 5)
 * Any features that are flagged in the code but not added here will always return false.
 */
export enum ActiveFeatureKeys {
    LambdaUpload = 'LambdaUpload',
    LambdaImport = 'LambdaImport',
}

export const disableApigw = true

/**
 * This class handles feature access for unreleased or gated features.
 * Example: adding a feature called `NewFeature1`:
 *
 * Add the following to the `featureToggle.ActiveFeatureKeys` enum:
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
 * FeatureToggle.isFeatureActive(featureToggle.ActiveFeatureKeys.NewFeature1)
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
export class FeatureToggle {
    private readonly enabledFeatures: Set<string>

    private readonly maxFeatures: number = 5

    private static INSTANCE: FeatureToggle | undefined

    public constructor(
        configuration: SettingsConfiguration = new DefaultSettingsConfiguration(extensionSettingsPrefix),
        overrideKeys?: string[]
    ) {
        this.enabledFeatures = new Set()

        let keys: string[] = []

        if (overrideKeys) {
            keys = overrideKeys
        } else {
            keys = Object.keys(ActiveFeatureKeys)
        }

        if (keys.length > this.maxFeatures) {
            throw new Error(
                `Amount of active feature flags (${keys.length}) exceeds maximum allowed (${this.maxFeatures}).`
            )
        }

        const settingsArr = configuration.readSetting('experimentalFeatureFlags')

        if (Array.isArray(settingsArr)) {
            for (const setting of settingsArr) {
                // check for string as settings.json does not enforce types
                if (typeof setting === 'string' && keys.includes(setting)) {
                    this.enabledFeatures.add(setting)
                }
            }
        }
    }

    /**
     * Returns a boolean on whether or not to display a feature
     * @param key Feature key to search for
     */
    public isFeatureActive(key: string): boolean {
        return this.enabledFeatures.has(key)
    }

    public static getFeatureToggle(): FeatureToggle {
        if (!FeatureToggle.INSTANCE) {
            FeatureToggle.INSTANCE = new FeatureToggle()
        }

        return FeatureToggle.INSTANCE
    }
}
