/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { FeatureValue } from '../client/codewhispereruserclient'
import { codeWhispererClient as client } from '../client/codewhisperer'
import { AuthUtil } from '../util/authUtil'
import { getLogger } from '../../shared/logger'
import { isBuilderIdConnection, isIdcSsoConnection } from '../../auth/connection'
import { getAvailableCustomizationsList } from '../util/customizationUtil'

export class FeatureContext {
    constructor(public name: string, public variation: string, public value: FeatureValue) {}
}

const testFeatureName = 'testFeature'
const customizationArnOverrideName = 'customizationArnOverride'
const featureConfigPollIntervalInMs = 30 * 60 * 1000 // 30 mins

// TODO: add real feature later
export const featureDefinitions = new Map([
    [testFeatureName, new FeatureContext(testFeatureName, 'CONTROL', { stringValue: 'testValue' })],
    [
        customizationArnOverrideName,
        new FeatureContext(customizationArnOverrideName, 'customizationARN', { stringValue: '' }),
    ],
])

export class FeatureConfigProvider {
    private featureConfigs = new Map<string, FeatureContext>()

    static #instance: FeatureConfigProvider

    constructor() {
        this.fetchFeatureConfigs().catch(e => {
            getLogger().error('fetchFeatureConfigs failed: %s', (e as Error).message)
        })

        setInterval(this.fetchFeatureConfigs.bind(this), featureConfigPollIntervalInMs)
    }

    public static get instance() {
        return (this.#instance ??= new this())
    }

    async fetchFeatureConfigs(): Promise<void> {
        if (AuthUtil.instance.isConnectionExpired()) {
            return
        }

        getLogger().debug('amazonq: Fetching feature configs')
        try {
            const response = await client.listFeatureEvaluations()

            // Overwrite feature configs from server response
            response.featureEvaluations.forEach(evaluation => {
                this.featureConfigs.set(
                    evaluation.feature,
                    new FeatureContext(evaluation.feature, evaluation.variation, evaluation.value)
                )
            })

            const customizationArnOverride = this.featureConfigs.get(customizationArnOverrideName)?.value?.stringValue
            if (customizationArnOverride !== undefined) {
                // Double check if server-side wrongly returns a customizationArn to BID users
                if (isBuilderIdConnection(AuthUtil.instance.conn)) {
                    this.featureConfigs.delete(customizationArnOverrideName)
                } else if (isIdcSsoConnection(AuthUtil.instance.conn)) {
                    let availableCustomizations = null
                    try {
                        availableCustomizations = (await getAvailableCustomizationsList()).map(c => c.arn)
                    } catch (e) {
                        getLogger().debug('amazonq: Failed to list available customizations')
                    }

                    // If customizationArn from A/B is not available in listAvailableCustomizations response, don't use this value
                    if (!availableCustomizations?.includes(customizationArnOverride)) {
                        getLogger().debug(
                            `Customization arn ${customizationArnOverride} not available in listAvailableCustomizations, not using`
                        )
                        this.featureConfigs.delete(customizationArnOverrideName)
                    }
                }
            }
        } catch (e) {
            getLogger().error(`CodeWhisperer: Error when fetching feature configs ${e}`, e)
        }
        getLogger().debug(`CodeWhisperer: Current feature configs: ${this.getFeatureConfigsTelemetry()}`)
    }

    // Sample format: "{testFeature: CONTROL}""
    getFeatureConfigsTelemetry(): string {
        return `{${Array.from(this.featureConfigs.entries())
            .map(([name, context]) => `${name}: ${context.variation}`)
            .join(', ')}}`
    }

    // TODO: for all feature variations, define a contract that can be enforced upon the implementation of
    // the business logic.
    // When we align on a new feature config, client-side will implement specific business logic to utilize
    // these values by:
    // 1) Add an entry in featureDefinitions, which is <feature_name> to <feature_context>.
    // 2) Add a function with name `getXXX`, where XXX refers to the feature name.
    // 3) Specify the return type: One of the return type string/boolean/Long/Double should be used here.
    // 4) Specify the key for the `getFeatureValueForKey` helper function which is the feature name.
    // 5) Specify the corresponding type value getter for the `FeatureValue` class. For example,
    // if the return type is Long, then the corresponding type value getter is `longValue()`.
    // 6) Add a test case for this feature.
    // 7) In case `getXXX()` returns undefined, it should be treated as a default/control group.
    getTestFeature(): string | undefined {
        return this.getFeatureValueForKey(testFeatureName).stringValue
    }

    getCustomizationArnOverride(): string | undefined {
        return this.getFeatureValueForKey(customizationArnOverrideName).stringValue
    }

    // Get the feature value for the given key.
    // In case of a misconfiguration, it will return a default feature value of Boolean true.
    private getFeatureValueForKey(name: string): FeatureValue {
        return this.featureConfigs.get(name)?.value ?? featureDefinitions.get(name)?.value ?? { boolValue: true }
    }
}
