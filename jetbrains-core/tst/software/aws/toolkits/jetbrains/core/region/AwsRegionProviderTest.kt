// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.region

import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.Rule
import org.junit.Test
import software.aws.toolkits.core.rules.SystemPropertyHelper
import software.aws.toolkits.core.utils.RemoteResource
import software.aws.toolkits.core.utils.RemoteResourceResolver
import software.aws.toolkits.core.utils.writeText
import software.aws.toolkits.jetbrains.core.RemoteResourceResolverProvider
import java.nio.file.Files
import java.nio.file.Path
import java.util.concurrent.CompletableFuture
import java.util.concurrent.CompletionStage

class AwsRegionProviderTest {
    @Rule
    @JvmField
    val systemPropertyHelper = SystemPropertyHelper()

    @Test
    fun nonAwsPartitionIsIgnored() {
        val regionProvider = createRegionDataProvider(
            """
            {
                "partitions": [
                    {
                        "defaults": {
                            "hostname": "{service}.{region}.{dnsSuffix}",
                            "protocols": ["https"],
                            "signatureVersions": ["v4"]
                        },
                        "dnsSuffix": "amazonaws.com",
                        "partition": "aws",
                        "partitionName": "AWS Standard",
                        "regionRegex": "^(us|eu|ap|sa|ca|me)\\-\\w+\\-\\d+$",
                        "regions": {
                            "us-west-2": {
                                "description": "US West (Oregon)"
                            }
                        },
                        "services": {}
                    },
                    {
                        "defaults": {
                            "hostname": "{service}.{region}.{dnsSuffix}",
                            "protocols": ["https"],
                            "signatureVersions": ["v4"]
                        },
                        "dnsSuffix": "amazonaws.com.cn",
                        "partition": "aws-cn",
                        "partitionName": "AWS China",
                        "regionRegex": "^cn\\-\\w+\\-\\d+$",
                        "regions": {
                            "cn-north-1": {
                                "description": "China (Beijing)"
                            }
                        },
                        "services": {}
                    }
                ],
                "version": 3
            }
            """.trimIndent()
        )

        val awsRegionProvider = AwsRegionProvider(regionProvider)
        assertThat(awsRegionProvider.regions()).doesNotContainKey("cn-north-1").containsKey("us-west-2")
    }

    @Test
    fun noDefaultRegionFallsBackToUsEast1() {
        val regionProvider = createRegionDataProvider(
            """
            {
                "partitions": [
                    {
                        "defaults": {
                            "hostname": "{service}.{region}.{dnsSuffix}",
                            "protocols": ["https"],
                            "signatureVersions": ["v4"]
                        },
                        "dnsSuffix": "amazonaws.com",
                        "partition": "aws",
                        "partitionName": "AWS Standard",
                        "regionRegex": "^(us|eu|ap|sa|ca|me)\\-\\w+\\-\\d+$",
                        "regions": {
                            "us-east-1": {
                                "description": "US East (N. Virginia)"
                            }
                        },
                        "services": {}
                    }
                ],
                "version": 3
            }
            """.trimIndent()
        )

        val awsRegionProvider = AwsRegionProvider(regionProvider)
        assertThat(awsRegionProvider.defaultRegion().id).isEqualTo("us-east-1")
    }

    @Test
    fun emptyRegionsCantHaveADefaultDueToError() {
        val regionProvider = createRegionDataProvider("")

        val awsRegionProvider = AwsRegionProvider(regionProvider)
        assertThatThrownBy { awsRegionProvider.defaultRegion() }.isInstanceOf(IllegalStateException::class.java)
    }

    @Test
    fun defaultProfileInCredentialsIsRespected() {
        val awsFolder = Files.createTempDirectory("aws")
        val configFile = awsFolder.resolve("config")
        System.getProperties().setProperty("aws.configFile", configFile.toAbsolutePath().toString())

        configFile.writeText(
            """
            [default]
            region = us-west-2
            """.trimIndent()
        )

        val regionProvider = createRegionDataProvider(
            """
            {
                "partitions": [
                    {
                        "defaults": {
                            "hostname": "{service}.{region}.{dnsSuffix}",
                            "protocols": ["https"],
                            "signatureVersions": ["v4"]
                        },
                        "dnsSuffix": "amazonaws.com",
                        "partition": "aws",
                        "partitionName": "AWS Standard",
                        "regionRegex": "^(us|eu|ap|sa|ca|me)\\-\\w+\\-\\d+$",
                        "regions": {
                            "us-west-2": {
                                "description": "US West (Oregon)"
                            }
                        },
                        "services": {}
                    }
                ],
                "version": 3
            }
            """.trimIndent()
        )

        val awsRegionProvider = AwsRegionProvider(regionProvider)
        assertThat(awsRegionProvider.defaultRegion().id).isEqualTo("us-west-2")
    }

    private fun createRegionDataProvider(endpointsData: String) = object : RemoteResourceResolverProvider {
        override fun get() = object : RemoteResourceResolver {
            override fun resolve(resource: RemoteResource): CompletionStage<Path> = CompletableFuture<Path>().apply {
                complete(
                    Files.createTempFile("endpointData", ".json").apply {
                        writeText(endpointsData)
                    }
                )
            }
        }
    }
}
