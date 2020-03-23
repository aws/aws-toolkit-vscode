// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.ecs.execution

import base.AwsReuseSolutionTestBase
import com.intellij.execution.BeforeRunTask
import com.intellij.execution.configurations.RuntimeConfigurationError
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.mockito.Mockito
import org.testng.annotations.Test
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials
import software.amazon.awssdk.services.ecs.model.ContainerDefinition
import software.amazon.awssdk.services.ecs.model.Service
import software.amazon.awssdk.services.ecs.model.TaskDefinition
import software.aws.toolkits.core.credentials.ToolkitCredentialsIdentifier
import software.aws.toolkits.jetbrains.core.MockResourceCache
import software.aws.toolkits.jetbrains.core.credentials.MockCredentialsManager
import software.aws.toolkits.jetbrains.services.clouddebug.CloudDebuggingPlatform
import software.aws.toolkits.jetbrains.services.ecs.resources.EcsResources
import software.aws.toolkits.resources.message

class DotNetEcsCloudDebugRunConfigurationTest : AwsReuseSolutionTestBase() {

    private val containerOptionsKey = "111"
    private val defaultClusterArn = "arn"
    private val defaultServiceArn = "arn"
    private val defaultRegion = "us-east-1"

    override fun getSolutionDirectoryName() = "SamHelloWorldApp"

    @Test
    fun testCheckConfiguration_StartupCommand_NotStartWithDotNet() {
        val container = makeFakeContainerOptions().apply { startCommand = "not start with dotnet" }
        val config = buildDefaultConfiguration().also { configuration ->
            configuration.containerOptions(mapOf("abc" to container))
        }

        setFakeContainersInResourceCache(listOf("abc"))
        assertThatThrownBy {
            config.checkConfiguration()
        }.isInstanceOf(RuntimeConfigurationError::class.java)
            .hasMessage(message("cloud_debug.run_configuration.dotnet.start_command.miss_runtime", "dotnet"))
    }

    private fun buildDefaultConfiguration(): EcsCloudDebugRunConfiguration {
        val configuration = EcsCloudDebugRunConfiguration(
            project,
            EcsCloudDebugRunConfigurationProducer.getFactory()
        )
        // Mockito kotlin does not work for this because of how weirdly BeforeRunTask is set up
        configuration.beforeRunTasks = mutableListOf(Mockito.mock(BeforeRunTask::class.java))
        configuration.clusterArn(defaultClusterArn)
        configuration.serviceArn(defaultServiceArn)
        configuration.regionId(defaultRegion)
        configuration.credentialProviderId(mockCredentials.id)
        configuration.containerOptions(mapOf(containerOptionsKey to makeFakeContainerOptions()))

        // also mock out the resource cache since we check that services might exist
        setFakeContainersInResourceCache()

        return configuration
    }

    private fun makeFakeContainerOptions(): ContainerOptions {
        val containerOptions = ContainerOptions()
        containerOptions.platform = CloudDebuggingPlatform.DOTNET
        containerOptions.startCommand = "start command"
        containerOptions.artifactMappings = listOf(ArtifactMapping("/src/local", "/src/remote"))
        containerOptions.portMappings = listOf(PortMapping(2222, 8080))

        return containerOptions
    }

    private fun setFakeContainersInResourceCache(
        containerNames: List<String> = listOf(),
        clusterArn: String = defaultClusterArn,
        serviceArn: String = defaultServiceArn,
        regionId: String = defaultRegion,
        credentialsIdentifier: ToolkitCredentialsIdentifier = mockCredentials
    ) {
        val resourceCache = MockResourceCache.getInstance(project)
        val taskDefinitionName = "taskDefinition"
        val fakeService = Service.builder()
            .clusterArn(clusterArn)
            .serviceArn(serviceArn)
            .taskDefinition(taskDefinitionName)
            .build()
        val fakeTaskDefinition = TaskDefinition.builder()
            .containerDefinitions(containerNames.plus(containerOptionsKey).map {
                ContainerDefinition.builder().name(it).build()
            })
            .build()
        resourceCache.addEntry(EcsResources.describeService(clusterArn, serviceArn), regionId, credentialsIdentifier.id, fakeService)
        resourceCache.addEntry(EcsResources.describeTaskDefinition(taskDefinitionName), regionId, credentialsIdentifier.id, fakeTaskDefinition)
    }

    private val mockCredentials: ToolkitCredentialsIdentifier
        get() = MockCredentialsManager.getInstance().addCredentials(
            "mockCreds",
            AwsBasicCredentials.create("foo", "bar")
        )
}
