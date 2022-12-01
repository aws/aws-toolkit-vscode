// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.gateway

import com.fasterxml.jackson.databind.DeserializationFeature
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.fasterxml.jackson.module.kotlin.readValue
import com.intellij.util.io.HttpRequests
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.DynamicTest
import org.junit.jupiter.api.TestFactory

class GatewayEcrVersionsKtTest {
    @TestFactory
    fun `test manifest images are valid`(): Iterator<DynamicTest> {
        val uriCache = mutableMapOf<String, List<String>>()
        return sequence<DynamicTest> {
            val images = gatewayManifest().images
            images.forEach { product ->
                val validUris = uriCache.computeIfAbsent(product.productCode) { productCode ->
                    fetchTagsForIde(productCode).map {
                        "public.ecr.aws/jetbrains/${productCode.lowercase()}:$it"
                    }
                }

                yield(DynamicTest.dynamicTest("${product.ecrImage} exists") { assertThat(validUris).contains(product.ecrImage) })
            }
        }.iterator()
    }

    private fun fetchTagsForIde(productCode: String) =
        HttpRequests.request("https://public.ecr.aws/v2/jetbrains/${productCode.lowercase()}/tags/list")
            .tuner {
                it.setRequestProperty("Authorization", "Bearer $ecrPublicToken")
            }.connect {
                mapper.readValue<EcrPublicListTagsResponse>(it.readString()).tags
            }

    private companion object {
        val mapper = jacksonObjectMapper()
            .disable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)

        val ecrPublicToken by lazy {
            mapper.readValue<EcrPublicToken>(HttpRequests.request("https://public.ecr.aws/token/").readString()).token
        }
    }
}

data class EcrPublicToken(
    val token: String
)

data class EcrPublicListTagsResponse(
    val name: String,
    val tags: List<String>
)
