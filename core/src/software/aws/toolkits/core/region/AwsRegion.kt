// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.core.region

import software.amazon.awssdk.regions.Region

data class AwsRegion(val id: String, val name: String) {
    val category: String? = when {
        id.startsWith("us") -> "North America"
        id.startsWith("ca") -> "North America"
        id.startsWith("eu") -> "Europe"
        id.startsWith("ap") -> "Asia Pacific"
        id.startsWith("sa") -> "South America"
        id.startsWith("cn") -> "China"
        id.startsWith("me") -> "Middle East"
        else -> null
    }

    val displayName: String = when {
        category == "Europe" -> "${name.trimPrefixAndRemoveBrackets("EU")} ($id)"
        category == "North America" -> "${name.removePrefix("US West").trimPrefixAndRemoveBrackets("US East")} ($id)"
        category != null && name.startsWith(category) -> "${name.trimPrefixAndRemoveBrackets(category)} ($id)"
        else -> name
    }

    fun toEnvironmentVariables() = mapOf(
        "AWS_REGION" to id,
        "AWS_DEFAULT_REGION" to id
    )

    companion object {
        val GLOBAL = AwsRegion(Region.AWS_GLOBAL.id(), "Global")
        private fun String.trimPrefixAndRemoveBrackets(prefix: String) = this.removePrefix(prefix).replace("(", "").replace(")", "").trim()
    }
}