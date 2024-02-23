// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.caws

import com.fasterxml.jackson.annotation.JsonProperty
import com.fasterxml.jackson.databind.DeserializationFeature
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.fasterxml.jackson.module.kotlin.readValue
import software.amazon.awssdk.services.codecatalyst.CodeCatalystClient
import software.amazon.awssdk.services.codecatalyst.model.InstanceType

private val descriptions: ParameterDescriptions by lazy {
    ParameterDescriptions::class.java.getResourceAsStream("parameterDescriptions.json")?.use {
        jacksonObjectMapper()
            .enable(DeserializationFeature.READ_ENUMS_USING_TO_STRING)
            .disable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES).readValue(it)
    } ?: throw IllegalStateException("Failed to locate parameterDescriptions.json")
}

fun loadParameterDescriptions(): ParameterDescriptions = descriptions

data class ParameterDescriptions(
    @JsonProperty("environment")
    val environmentParameters: EnvironmentParameters
)

data class EnvironmentParameters(
    @JsonProperty("instanceType")
    val instanceTypes: Map<InstanceType, InstanceInfo>,
    val persistentStorageSize: List<Int>
)

data class InstanceInfo(
    @JsonProperty("vcpus")
    val vCpus: Int,
    val ram: Ram,
    val arch: String
)

data class Ram(
    val value: Int,
    val unit: String
)

fun isSubscriptionFreeTier(
    client: CodeCatalystClient,
    space: String?
): Boolean {
    val subscriptionTier = if (space != null) {
        client.getSubscription {
            it.spaceName(space)
        }.subscriptionType()
    } else {
        return true
    }

    return subscriptionTier == "FREE"
}

fun InstanceType.isSupportedInFreeTier() =
    when (this) {
        InstanceType.DEV_STANDARD1_SMALL -> true
        else -> false
    }

fun Int.isSupportedInFreeTier() =
    when (this) {
        16 -> true
        else -> false
    }
