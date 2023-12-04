// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.service

import com.intellij.openapi.components.service
import com.intellij.openapi.project.Project
import com.intellij.util.concurrency.annotations.RequiresBackgroundThread
import software.amazon.awssdk.services.codewhispererruntime.model.FeatureValue
import software.aws.toolkits.core.utils.debug
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.jetbrains.services.codewhisperer.credentials.CodeWhispererClientAdaptor
import software.aws.toolkits.jetbrains.services.codewhisperer.explorer.isCodeWhispererExpired

class CodeWhispererFeatureConfigService {
    private val featureConfigs = mutableMapOf<String, FeatureContext>()

    @RequiresBackgroundThread
    fun fetchFeatureConfigs(project: Project) {
        if (isCodeWhispererExpired(project)) return

        LOG.debug { "Fetching feature configs" }
        try {
            val response = CodeWhispererClientAdaptor.getInstance(project).listFeatureEvaluations()

            // Simply force overwrite feature configs from server response, no needed to check existing values.
            response.featureEvaluations().forEach {
                featureConfigs[it.feature()] = FeatureContext(it.feature(), it.variation(), it.value())
            }
        } catch (e: Exception) {
            LOG.debug(e) { "Error when fetching feature configs" }
        }
        LOG.debug { "Current feature configs: ${getFeatureConfigsTelemetry()}" }
    }

    fun getFeatureConfigsTelemetry(): String =
        "{${featureConfigs.entries.joinToString(", ") { (name, context) ->
            "$name: ${context.variation}"
        }}}"

    // TODO: for all feature variations, define a contract that can be enforced upon the implementation of
    // the business logic.
    // When we align on a new feature config, client-side will implement specific business logic to utilize
    // these values by:
    // 1) Add an entry in FEATURE_DEFINITIONS, which is <feature_name> to <feature_context>.
    // 2) Add a function with name `getXXX`, where XXX refers to the feature name.
    // 3) Specify the return type: One of the return type String/Boolean/Long/Double should be used here.
    // 4) Specify the key for the `getFeatureValueForKey` helper function which is the feature name.
    // 5) Specify the corresponding type value getter for the `FeatureValue` class. For example,
    // if the return type is Long, then the corresponding type value getter is `longValue()`.
    // 6) Add a test case for this feature.
    fun getTestFeature(): String = getFeatureValueForKey(TEST_FEATURE_NAME).stringValue()

    // Get the feature value for the given key.
    // In case of a misconfiguration, it will return a default feature value of Boolean true.
    private fun getFeatureValueForKey(name: String): FeatureValue =
        featureConfigs[name]?.value ?: FEATURE_DEFINITIONS[name]?.value
            ?: FeatureValue.builder().boolValue(true).build()

    companion object {
        fun getInstance(): CodeWhispererFeatureConfigService = service()
        private const val TEST_FEATURE_NAME = "testFeature"
        private val LOG = getLogger<CodeWhispererFeatureConfigService>()

        // TODO: add real feature later
        internal val FEATURE_DEFINITIONS = mapOf(
            TEST_FEATURE_NAME to FeatureContext(
                TEST_FEATURE_NAME,
                "CONTROL",
                FeatureValue.builder().stringValue("testValue").build()
            )
        )
    }
}

data class FeatureContext(
    val name: String,
    val variation: String,
    val value: FeatureValue
)
