// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.region

import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import software.aws.toolkits.core.rules.EnvironmentVariableHelper
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

    @Rule
    @JvmField
    val environmentVariableHelper = EnvironmentVariableHelper()

    @Before
    fun setUp() {
        // Isolate our tests
        System.getProperties().setProperty("aws.configFile", Files.createTempFile("dummy", null).toAbsolutePath().toString())
        System.getProperties().setProperty("aws.sharedCredentialsFile", Files.createTempFile("dummy", null).toAbsolutePath().toString())
        System.getProperties().remove("aws.region")
        environmentVariableHelper.remove("AWS_REGION")
    }

    @Test
    fun correctRegionDataIsFiltered() {
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
        assertThat(awsRegionProvider.regions("aws")).doesNotContainKey("cn-north-1").containsKey("us-west-2")
    }

    @Test
    fun allRegionsWorks() {
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
        assertThat(awsRegionProvider.allRegions())
            .containsKey("cn-north-1")
            .containsKey("us-west-2")
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
        assertThatThrownBy { awsRegionProvider.defaultRegion() }.isInstanceOf(IllegalArgumentException::class.java)
    }

    @Test
    fun defaultProfileInCredentialsIsRespected() {
        val awsFolder = Files.createTempDirectory("aws")
        val configFile = awsFolder.resolve("config")
        System.getProperties().setProperty("aws.configFile", configFile.toAbsolutePath().toString())

        configFile.writeText(
            """
            [default]
            region = us-west-2001
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
                            "us-west-2001": {
                                "description": "US West (Cascadia)"
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
        assertThat(awsRegionProvider.defaultRegion().id).isEqualTo("us-west-2001")
    }

    @Test
    fun testGlobalServices() {
        val regionProvider = createRegionDataProvider(
            """
            {
                "partitions": [
                    {
                        "defaults": {
                            "hostname": "{service}.{region}.{dnsSuffix}",
                            "protocols": [
                                "https"
                            ],
                            "signatureVersions": [
                                "v4"
                            ]
                        },
                        "dnsSuffix": "amazonaws.com",
                        "partition": "aws",
                        "partitionName": "AWS Standard",
                        "regionRegex": "^(us|eu|ap|sa|ca|me)\\-\\w+\\-\\d+$",
                        "regions": {
                            "us-east-1" : {
                                "description" : "US East (N. Virginia)"
                            }
                        },
                        "services": {
                            "dynamodb": {
                                "defaults": {
                                    "protocols": [
                                        "http",
                                        "https"
                                    ]
                                },
                                "endpoints": {
                                    "us-east-1": {},
                                    "us-east-1-fips": {
                                        "credentialScope": {
                                            "region": "us-east-1"
                                        },
                                        "hostname": "dynamodb-fips.us-east-1.amazonaws.com"
                                    }
                                }
                            },
                            "iam": {
                                "endpoints": {
                                    "aws-global": {
                                        "credentialScope": {
                                            "region": "us-east-1"
                                        },
                                        "hostname": "iam.amazonaws.com"
                                    }
                                },
                                "isRegionalized": false,
                                "partitionEndpoint": "aws-global"
                            }
                        }
                    }
                ],
                "version": 3
            }
            """.trimIndent()
        )

        val awsRegionProvider = AwsRegionProvider(regionProvider)
        val usEast1 = awsRegionProvider.regions("aws")["us-east-1"] ?: throw IllegalStateException("Bad test data")

        assertThat(awsRegionProvider.isServiceGlobal(usEast1, "dynamodb")).isFalse()

        assertThat(awsRegionProvider.isServiceGlobal(usEast1, "iam")).isTrue()
        assertThat(awsRegionProvider.getGlobalRegionForService(usEast1, "iam").id).isEqualTo("aws-global")
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
