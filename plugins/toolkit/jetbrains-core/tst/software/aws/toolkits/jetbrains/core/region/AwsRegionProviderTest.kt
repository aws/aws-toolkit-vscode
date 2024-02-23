// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.region

import com.intellij.openapi.application.ApplicationManager
import com.intellij.testFramework.ApplicationRule
import com.intellij.testFramework.DisposableRule
import com.intellij.testFramework.replaceService
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import software.aws.toolkits.core.rules.EnvironmentVariableHelper
import software.aws.toolkits.core.rules.SystemPropertyHelper
import software.aws.toolkits.core.utils.RemoteResource
import software.aws.toolkits.core.utils.RemoteResourceResolver
import software.aws.toolkits.core.utils.exists
import software.aws.toolkits.core.utils.writeText
import software.aws.toolkits.jetbrains.core.RemoteResourceResolverProvider
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.Paths
import java.util.concurrent.CompletableFuture
import java.util.concurrent.CompletionStage

class AwsRegionProviderTest {
    @Rule
    @JvmField
    val applicationRule = ApplicationRule()

    @Rule
    @JvmField
    val systemPropertyHelper = SystemPropertyHelper()

    @Rule
    @JvmField
    val environmentVariableHelper = EnvironmentVariableHelper()

    @Rule
    @JvmField
    val disposableRule = DisposableRule()

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
        createRegionDataProvider()

        val awsRegionProvider = AwsRegionProvider()
        assertThat(awsRegionProvider.regions("aws")).containsOnlyKeys("us-west-2001", "us-east-1")
    }

    @Test
    fun allRegionsWorks() {
        createRegionDataProvider()
        val awsRegionProvider = AwsRegionProvider()
        assertThat(awsRegionProvider.allRegions()).containsOnlyKeys("moon-east-2001", "us-west-2001", "us-east-1")
    }

    @Test
    fun allRegionsForServiceWorks() {
        createRegionDataProvider()
        val awsRegionProvider = AwsRegionProvider()
        assertThat(awsRegionProvider.allRegionsForService("single-region-service")).containsOnlyKeys("us-west-2001")
    }

    @Test
    fun allRegionsWorksFallsBackToBundledResource() {
        createRegionDataProvider("all-Regions-Works-Falls-Back-To-Bundled-Resource.json")
        val awsRegionProvider = AwsRegionProvider()
        assertThat(awsRegionProvider.partitions()).isNotEmpty
    }

    @Test
    fun noDefaultRegionFallsBackToUsEast1() {
        createRegionDataProvider("no-default-region-us-east-1-fallback-endpoints.json")
        val awsRegionProvider = AwsRegionProvider()
        assertThat(awsRegionProvider.defaultRegion().id).isEqualTo("us-east-1")
    }

    @Test
    fun noUsEast1FallbackToFirstRegionInMetadata() {
        createRegionDataProvider("no-default-region-no-us-east-1-endpoints.json")
        val awsRegionProvider = AwsRegionProvider()
        assertThat(awsRegionProvider.defaultRegion().id).isEqualTo("us-region-1")
    }

    @Test
    fun emptyRegionsCantHaveADefaultDueToError() {
        createRegionDataProvider("no-regions-endpoints.json")
        val awsRegionProvider = AwsRegionProvider()
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
            region = us-west-2001
            """.trimIndent()
        )

        createRegionDataProvider()

        val awsRegionProvider = AwsRegionProvider()
        assertThat(awsRegionProvider.defaultRegion().id).isEqualTo("us-west-2001")
    }

    @Test
    fun testGlobalServices() {
        createRegionDataProvider()

        val awsRegionProvider = AwsRegionProvider()
        val usEast1 = awsRegionProvider.regions("aws")["us-east-1"] ?: throw IllegalStateException("Bad test data")

        assertThat(awsRegionProvider.isServiceGlobal(usEast1, "dynamodb")).isFalse()
        assertThat(awsRegionProvider.isServiceGlobal(usEast1, "global-service")).isTrue()
        assertThat(awsRegionProvider.isServiceGlobal(usEast1, "non-existent-service")).isFalse()
        assertThat(awsRegionProvider.getGlobalRegionForService(usEast1, "global-service").id).isEqualTo("aws-global")
    }

    @Test
    fun defaultPartitionIsBasedOnDefaultRegion() {
        val awsFolder = Files.createTempDirectory("aws")
        val configFile = awsFolder.resolve("config")
        System.getProperties().setProperty("aws.configFile", configFile.toAbsolutePath().toString())

        configFile.writeText(
            """
            [default]
            region = moon-east-2001
            """.trimIndent()
        )

        createRegionDataProvider()

        val awsRegionProvider = AwsRegionProvider()

        assertThat(awsRegionProvider.defaultPartition()).satisfies {
            assertThat(it.id).isEqualTo("moon")
        }
    }

    private fun createRegionDataProvider(endpointsFile: String = "simplified-multi-partition-endpoint.json") {
        val file = javaClass.getResource(endpointsFile)?.let { Paths.get(it.toURI()).takeIf { f -> f.exists() } }
            ?: throw RuntimeException("Test file $endpointsFile not found")

        val mockRemoteResource = object : RemoteResourceResolverProvider {
            override fun get() = object : RemoteResourceResolver {
                override fun resolve(resource: RemoteResource): CompletionStage<Path> = CompletableFuture<Path>().apply {
                    complete(file)
                }
            }
        }
        ApplicationManager.getApplication().replaceService(RemoteResourceResolverProvider::class.java, mockRemoteResource, disposableRule.disposable)
    }
}
