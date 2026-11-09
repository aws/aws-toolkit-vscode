/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { FeatureConfigProvider, FeatureContext } from '../../../shared/featureConfig'

export async function getFeatureConfigs(): Promise<string> {
    let featureConfigs = new Map<string, FeatureContext>()
    try {
        await FeatureConfigProvider.instance.fetchFeatureConfigs()
        featureConfigs = FeatureConfigProvider.getFeatureConfigs()
    } catch (error) {
        // eslint-disable-next-line aws-toolkits/no-console-log
        console.error('Error fetching feature configs:', error)
    }

    // Convert featureConfigs to a string suitable for data-features
    return JSON.stringify(Array.from(featureConfigs.entries()))
}

export function serialize(configs: string) {
    let featureDataAttributes = ''
    try {
        // Fetch and parse featureConfigs
        const featureConfigs = JSON.parse(configs)
        featureDataAttributes = featureConfigs
            .map((config: FeatureContext[]) => `data-feature-${config[1].name}="${config[1].variation}"`)
            .join(' ')
    } catch (error) {
        // eslint-disable-next-line aws-toolkits/no-console-log
        console.error('Error setting data-feature attribute for featureConfigs:', error)
    }
    return featureDataAttributes
}
