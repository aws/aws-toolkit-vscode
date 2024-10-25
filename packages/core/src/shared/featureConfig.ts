/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    Customization,
    FeatureValue,
    ListFeatureEvaluationsRequest,
    ListFeatureEvaluationsResponse,
} from '../codewhisperer/client/codewhispereruserclient'
import { codeWhispererClient as client } from '../codewhisperer/client/codewhisperer'
import { AuthUtil } from '../codewhisperer/util/authUtil'
import { getLogger } from './logger'
import { isBuilderIdConnection, isIdcSsoConnection } from '../auth/connection'
import { CodeWhispererSettings } from '../codewhisperer/util/codewhispererSettings'
import globals from './extensionGlobals'
import { getClientId, getOperatingSystem } from './telemetry/util'
import { extensionVersion } from './vscode/env'
import { telemetry } from './telemetry'

export class FeatureContext {
    constructor(
        public name: string,
        public variation: string,
        public value: FeatureValue
    ) {}
}

const featureConfigPollIntervalInMs = 30 * 60 * 1000 // 30 mins

export const Features = {
    customizationArnOverride: 'customizationArnOverride',
    dataCollectionFeature: 'IDEProjectContextDataCollection',
    projectContextFeature: 'ProjectContextV2',
    test: 'testFeature',
} as const

export type FeatureName = (typeof Features)[keyof typeof Features]

export const featureDefinitions = new Map<FeatureName, FeatureContext>([
    [Features.test, new FeatureContext(Features.test, 'CONTROL', { stringValue: 'testValue' })],
    [
        Features.customizationArnOverride,
        new FeatureContext(Features.customizationArnOverride, 'customizationARN', { stringValue: '' }),
    ],
])

export class FeatureConfigProvider {
    private featureConfigs = new Map<string, FeatureContext>()

    static #instance: FeatureConfigProvider

    private _isDataCollectionGroup = false

    constructor() {
        this.fetchFeatureConfigs().catch((e) => {
            getLogger().error('fetchFeatureConfigs failed: %s', (e as Error).message)
        })

        setInterval(this.fetchFeatureConfigs.bind(this), featureConfigPollIntervalInMs)
    }

    public static get instance() {
        return (this.#instance ??= new this())
    }

    isAmznDataCollectionGroup(): boolean {
        return this._isDataCollectionGroup
    }

    isNewProjectContextGroup(): boolean {
        return this.featureConfigs.get(Features.projectContextFeature)?.variation === 'TREATMENT'
    }

    public async listFeatureEvaluations(): Promise<ListFeatureEvaluationsResponse> {
        const request: ListFeatureEvaluationsRequest = {
            userContext: {
                ideCategory: 'VSCODE',
                operatingSystem: getOperatingSystem(),
                product: 'CodeWhisperer', // TODO: update this?
                clientId: getClientId(globals.globalState),
                ideVersion: extensionVersion,
            },
        }
        return (await client.createUserSdkClient()).listFeatureEvaluations(request).promise()
    }

    async fetchFeatureConfigs(): Promise<void> {
        if (AuthUtil.instance.isConnectionExpired()) {
            return
        }

        getLogger().debug('amazonq: Fetching feature configs')
        try {
            const response = await this.listFeatureEvaluations()

            // Overwrite feature configs from server response
            response.featureEvaluations.forEach((evaluation) => {
                this.featureConfigs.set(
                    evaluation.feature,
                    new FeatureContext(evaluation.feature, evaluation.variation, evaluation.value)
                )

                telemetry.aws_featureConfig.run((span) => {
                    span.record({
                        id: evaluation.feature,
                        featureVariation: evaluation.variation,
                        featureValue: JSON.stringify(evaluation.value),
                    })
                })
            })
            getLogger().info('AB Testing Cohort Assignments %s', JSON.stringify(response.featureEvaluations))

            const customizationArnOverride = this.featureConfigs.get(Features.customizationArnOverride)?.value
                ?.stringValue
            if (customizationArnOverride !== undefined) {
                // Double check if server-side wrongly returns a customizationArn to BID users
                if (isBuilderIdConnection(AuthUtil.instance.conn)) {
                    this.featureConfigs.delete(Features.customizationArnOverride)
                } else if (isIdcSsoConnection(AuthUtil.instance.conn)) {
                    let availableCustomizations = undefined
                    try {
                        const items: Customization[] = []
                        const response = await client.listAvailableCustomizations()
                        response
                            .map(
                                (listAvailableCustomizationsResponse) =>
                                    listAvailableCustomizationsResponse.customizations
                            )
                            .forEach((customizations) => {
                                items.push(...customizations)
                            })
                        availableCustomizations = items.map((c) => c.arn)
                    } catch (e) {
                        getLogger().debug('amazonq: Failed to list available customizations')
                    }

                    // If customizationArn from A/B is not available in listAvailableCustomizations response, don't use this value
                    if (!availableCustomizations?.includes(customizationArnOverride)) {
                        getLogger().debug(
                            `Customization arn ${customizationArnOverride} not available in listAvailableCustomizations, not using`
                        )
                        this.featureConfigs.delete(Features.customizationArnOverride)
                    }
                }
            }

            const dataCollectionValue = this.featureConfigs.get(Features.dataCollectionFeature)?.value.stringValue
            if (dataCollectionValue === 'data-collection') {
                this._isDataCollectionGroup = true
                // Enable local workspace index by default, for Amzn users.
                const isSet = globals.globalState.get<boolean>('aws.amazonq.workspaceIndexToggleOn') || false
                if (!isSet) {
                    await CodeWhispererSettings.instance.enableLocalIndex()
                    globals.globalState.tryUpdate('aws.amazonq.workspaceIndexToggleOn', true)
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
        return this.getFeatureValueForKey(Features.test).stringValue
    }

    getCustomizationArnOverride(): string | undefined {
        return this.getFeatureValueForKey(Features.customizationArnOverride).stringValue
    }

    // Get the feature value for the given key.
    // In case of a misconfiguration, it will return a default feature value of Boolean true.
    private getFeatureValueForKey(name: FeatureName): FeatureValue {
        return this.featureConfigs.get(name)?.value ?? featureDefinitions.get(name)?.value ?? { boolValue: true }
    }

    /**
     * Map of feature configurations.
     *
     * @returns {Map<string, FeatureContext>} A Map containing the feature configurations, where the keys are strings representing the feature names, and the values are FeatureContext objects.
     */
    public static getFeatureConfigs(): Map<string, FeatureContext> {
        return FeatureConfigProvider.instance.featureConfigs
    }

    /**
     * Retrieves the FeatureContext object for a given feature name.
     *
     * @param {string} featureName - The name of the feature.
     * @returns {FeatureContext | undefined} The FeatureContext object for the specified feature, or undefined if the feature doesn't exist.
     */
    public static getFeature(featureName: FeatureName): FeatureContext | undefined {
        return FeatureConfigProvider.instance.featureConfigs.get(featureName)
    }

    /**
     * Checks if a feature is active or not.
     *
     * @param {string} featureName - The name of the feature to check.
     * @returns {boolean} False if the variation is not CONTROL, otherwise True
     */
    public static isEnabled(featureName: FeatureName): boolean {
        const featureContext = FeatureConfigProvider.getFeature(featureName)
        if (featureContext && featureContext.variation.toLocaleLowerCase() !== 'control') {
            return true
        }
        return false
    }
}
