// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.gateway

import com.fasterxml.jackson.annotation.JsonProperty

fun gatewayManifest(): GatewayManifest = GatewayManifest(LATEST_ECR)

data class GatewayManifest(
    @JsonProperty("images")
    private val latestImages: List<GatewayProduct>
) {
    val images = latestImages
}

data class GatewayProduct(
    @JsonProperty("dockerImageName")
    val ecrImage: String,
    @JsonProperty("buildNumber")
    val buildNumber: String,
    @JsonProperty("productCode")
    val productCode: String,
    @JsonProperty("marketingName")
    val fullName: String,
    @JsonProperty("tags")
    val tags: List<String>
) {
    val apiType = when (productCode) {
        "IU" -> "IntelliJ"
        "PY" -> "PyCharm"
        "GO" -> "GoLand"
        else -> error("Unknown API type for product code $productCode")
    }

    companion object {
        private fun getProductFullName(productCode: String) = when (productCode) {
            "IU" -> "IntelliJ IDEA Ultimate"
            "PY" -> "PyCharm Professional Edition"
            "GO" -> "GoLand Latest Stable"
            else -> productCode
        }
        fun fromWorkspace(ws: Workspace) = ws.ide?.let { ide ->
            val (productCode, buildNumber) = ws.build ?: throw IllegalStateException("Could not parse runtime for build: ${ide.runtime()}")
            GatewayProduct(
                ecrImage = ide.runtime(),
                buildNumber = buildNumber,
                productCode = productCode,
                fullName = "${getProductFullName(productCode)}-Outdated version",
                tags = emptyList()
            )
        }
    }
}

val LATEST_ECR = listOf(
    latestJbProduct("IU", "IntelliJ IDEA Ultimate Latest Stable"),
    latestJbProduct("PY", "PyCharm Professional Edition Latest Stable"),
    latestJbProduct("GO", "GoLand Latest Stable"),
)

private fun latestJbProduct(productCode: String, fullName: String) = GatewayProduct(
    ecrImage = "public.ecr.aws/jetbrains/${productCode.lowercase()}:release",
    buildNumber = "999.999",
    productCode = productCode,
    fullName = fullName,
    tags = listOf("Release")
)
