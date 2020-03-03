// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.ecs.execution

import com.intellij.execution.BeforeRunTask
import com.intellij.execution.ExecutorRegistry
import com.intellij.execution.configurations.RuntimeConfigurationError
import com.intellij.execution.configurations.RuntimeConfigurationWarning
import com.intellij.execution.executors.DefaultDebugExecutor
import com.intellij.execution.executors.DefaultRunExecutor
import com.intellij.execution.runners.ExecutionEnvironmentBuilder
import com.intellij.testFramework.ProjectRule
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.Rule
import org.junit.Test
import org.mockito.Mockito
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials
import software.amazon.awssdk.services.ecs.model.ContainerDefinition
import software.amazon.awssdk.services.ecs.model.Service
import software.amazon.awssdk.services.ecs.model.ServiceNotFoundException
import software.amazon.awssdk.services.ecs.model.TaskDefinition
import software.aws.toolkits.core.credentials.ToolkitCredentialsIdentifier
import software.aws.toolkits.jetbrains.core.MockResourceCache
import software.aws.toolkits.jetbrains.core.credentials.MockCredentialsManager
import software.aws.toolkits.jetbrains.services.clouddebug.CloudDebugConstants
import software.aws.toolkits.jetbrains.services.clouddebug.CloudDebuggingPlatform
import software.aws.toolkits.jetbrains.services.clouddebug.execution.CloudDebugRunState
import software.aws.toolkits.jetbrains.services.ecs.resources.EcsResources
import software.aws.toolkits.resources.message
import java.util.concurrent.CompletableFuture
import kotlin.test.assertNotNull

class EcsCloudDebugRunConfigurationTest {
    private val containerOptionsKey = "111"
    private val defaultClusterArn = "arn"
    private val defaultServiceArn = "arn"
    private val defaultRegion = "us-east-1"

    @JvmField
    @Rule
    val projectRule = ProjectRule()

    @Test
    fun happyPath() {
        val configuration = buildDefaultConfiguration()

        val state = getCloudDebugRunningState(configuration)
        assertThat(state).isNotNull
        assertThat(state!!.settings).isNotNull
        assertThat(configuration.clusterArn()).isEqualTo(state.settings.clusterArn)
        assertThat(configuration.serviceArn()).isEqualTo(state.settings.serviceArn)
    }

    @Test
    fun getStateValidatesRequiredClusterArn() {
        val configuration = buildDefaultConfiguration()
        configuration.clusterArn(null)

        val state = getCloudDebugRunningState(configuration)
        assertThat(state).isNull()
    }

    @Test
    fun factoryValidatesRequiredServiceArn() {
        val configuration = buildDefaultConfiguration()
        configuration.serviceArn(null)

        val state = getCloudDebugRunningState(configuration)
        assertThat(state).isNull()
    }

    @Test
    fun factoryValidatesRequiredContainerPlatform() {
        val configuration = buildDefaultConfiguration()
        configuration.containerOptions().getValue(containerOptionsKey).platform = null

        val state = getCloudDebugRunningState(configuration)
        assertThat(state).isNull()
    }

    @Test
    fun factoryValidatesRequiredContainerStartCommand() {
        val configuration = buildDefaultConfiguration()
        configuration.containerOptions().getValue(containerOptionsKey).startCommand = null

        val state = getCloudDebugRunningState(configuration)
        assertThat(state).isNull()
    }

    @Test
    fun factoryValidatesRequiredArtifactLocalPath() {
        val configuration = buildDefaultConfiguration()
        configuration.containerOptions().getValue(containerOptionsKey).artifactMappings.get(0).localPath = null

        val state = getCloudDebugRunningState(configuration)
        assertThat(state).isNull()
    }

    @Test
    fun factoryValidatesRequiredArtifactRemotePath() {
        val configuration = buildDefaultConfiguration()
        configuration.containerOptions().getValue(containerOptionsKey).artifactMappings.get(0).remotePath = null

        val state = getCloudDebugRunningState(configuration)
        assertThat(state).isNull()
    }

    @Test
    fun factoryValidatesRequiredPortMapLocal() {
        val configuration = buildDefaultConfiguration()
        configuration.containerOptions().getValue(containerOptionsKey).portMappings.get(0).localPort = null

        val state = getCloudDebugRunningState(configuration)
        assertThat(state).isNull()
    }

    @Test
    fun factoryValidatesRequiredPortMapRemote() {
        val configuration = buildDefaultConfiguration()
        configuration.containerOptions().getValue(containerOptionsKey).portMappings.get(0).remotePort = null

        val state = getCloudDebugRunningState(configuration)
        assertThat(state).isNull()
    }

    @Test
    fun validateClusterArnRequired() {
        val config = buildDefaultConfiguration().also { it.clusterArn(null) }
        assertThatThrownBy {
            config.checkConfiguration()
        }.isInstanceOf(RuntimeConfigurationError::class.java)
            .hasMessage(message("cloud_debug.run_configuration.missing.cluster_arn"))
    }

    @Test
    fun validateServiceArnRequired() {
        val config = buildDefaultConfiguration().also { it.serviceArn(null) }
        assertThatThrownBy {
            config.checkConfiguration()
        }.isInstanceOf(RuntimeConfigurationError::class.java)
            .hasMessage(message("cloud_debug.run_configuration.missing.service_arn"))
    }

    @Test
    fun validateAtLeastOneContainerSelected() {
        val config = buildDefaultConfiguration().also { it.containerOptions(mapOf()) }
        assertThatThrownBy {
            config.checkConfiguration()
        }.isInstanceOf(RuntimeConfigurationError::class.java)
            .hasMessage(message("cloud_debug.run_configuration.missing.container"))
    }

    @Test
    fun validateAllContainersHaveAStartCommand() {
        val config = buildDefaultConfiguration().also { configuration ->
            configuration.containerOptions().forEach {
                it.value.startCommand = null
            }
        }
        assertThatThrownBy {
            config.checkConfiguration()
        }.isInstanceOf(RuntimeConfigurationError::class.java)
            .hasMessage(message("cloud_debug.run_configuration.missing.start_command", config.containerOptions().keys.first()))
    }

    @Test
    fun validateRemoteDebuggingPortIsValid() {
        val config = buildDefaultConfiguration().also { configuration ->
            configuration.containerOptions().forEach {
                it.value.remoteDebugPorts = listOf(80000)
            }
        }
        assertThatThrownBy {
            config.checkConfiguration()
        }.isInstanceOf(RuntimeConfigurationError::class.java)
            .hasMessage(
                message(
                    "cloud_debug.run_configuration.missing.valid_debug_port",
                    config.containerOptions().values.first().remoteDebugPorts?.first().toString(),
                    config.containerOptions().keys.first()
                )
            )
    }

    @Test
    fun validateBeforeRequiredForJVM() {
        val config = buildDefaultConfiguration().also {
            it.beforeRunTasks = listOf()
        }
        assertThatThrownBy {
            config.checkConfiguration()
        }.isInstanceOf(RuntimeConfigurationWarning::class.java)
            .hasMessage(
                message(
                    "cloud_debug.run_configuration.missing.before_task",
                    config.containerOptions().keys.first(),
                    config.containerOptions().values.first().platform.toString()
                )
            )
    }

    @Test
    fun validateGeneratedRemoteDebugPortsAreUnique() {
        val container = makeFakeContainerOptions().apply { portMappings = listOf() }
        val config = buildDefaultConfiguration().also { configuration ->
            configuration.containerOptions(mapOf("abc" to container, "abcd" to container))
        }
        setFakeContainersInResourceCache(listOf("abc", "abcd"))
        val state = getCloudDebugRunningState(config)
        assertThat(state!!.settings.containerOptions.toList().first().second.remoteDebugPorts).isNotEqualTo(
            state.settings.containerOptions.toList().elementAt(1).second.remoteDebugPorts
        )
    }

    @Test
    fun validateGeneratedRemoteDebugPortsDoNotOverlapMappedPorts() {
        val container = makeFakeContainerOptions().apply { portMappings = listOf(PortMapping(32, CloudDebugConstants.DEFAULT_REMOTE_DEBUG_PORT)) }
        val config = buildDefaultConfiguration().also { configuration ->
            configuration.containerOptions(mapOf("abc" to container))
        }
        setFakeContainersInResourceCache(listOf("abc"))
        val state = getCloudDebugRunningState(config)
        assertThat(state!!.settings.containerOptions.toList().first().second.remoteDebugPorts).isNotEqualTo(CloudDebugConstants.DEFAULT_REMOTE_DEBUG_PORT)
    }

    @Test
    fun validateRemoteDebugPortDoesNotMatchMappedPort() {
        val container = makeFakeContainerOptions().apply { portMappings = listOf(); remoteDebugPorts = listOf(1212) }
        val config = buildDefaultConfiguration().also { configuration ->
            configuration.containerOptions(mapOf("abc" to container, "abcd" to container))
        }
        setFakeContainersInResourceCache(listOf("abc", "abcd"))
        assertThatThrownBy {
            config.checkConfiguration()
        }.isInstanceOf(RuntimeConfigurationError::class.java)
            .hasMessage(
                message(
                    "cloud_debug.run_configuration.duplicate_remote_debug_port",
                    "abcd",
                    "1212"
                )
            )
    }

    @Test
    fun validateRemoteDebugPortAndRemotePortUniqueness() {
        val container = makeFakeContainerOptions().apply { portMappings = listOf(PortMapping(32, 1212)); remoteDebugPorts = listOf(1212) }
        val config = buildDefaultConfiguration().also { configuration ->
            configuration.containerOptions(mapOf("abc" to container, "abcd" to container))
        }
        setFakeContainersInResourceCache(listOf("abc", "abcd"))
        assertThatThrownBy {
            config.checkConfiguration()
        }.isInstanceOf(RuntimeConfigurationError::class.java)
            .hasMessage(
                message(
                    "cloud_debug.run_configuration.duplicate_remote_debug_port",
                    "abc",
                    "1212"
                )
            )
    }

    @Test
    fun validateRemotePortUniquenessBetweenDifferentContainers() {
        val container = makeFakeContainerOptions().apply { portMappings = listOf(PortMapping(32, 1212)) }
        val container2 = makeFakeContainerOptions().apply { portMappings = listOf(PortMapping(33432, 1212)) }
        val config = buildDefaultConfiguration().also { configuration ->
            configuration.containerOptions(mapOf("abc" to container, "abcd" to container2))
        }
        setFakeContainersInResourceCache(listOf("abc", "abcd"))
        assertThatThrownBy {
            config.checkConfiguration()
        }.isInstanceOf(RuntimeConfigurationError::class.java)
            .hasMessage(
                message(
                    "cloud_debug.run_configuration.duplicate_remote_port",
                    "abc",
                    "abcd",
                    "1212"
                )
            )
    }

    @Test
    fun validateRemotePortUniquenessSameContainer() {
        val container = makeFakeContainerOptions().apply {
            portMappings = listOf(PortMapping(32, 1212), PortMapping(232, 1212))
        }
        val config = buildDefaultConfiguration().also { configuration ->
            configuration.containerOptions(mapOf("abc" to container))
        }
        setFakeContainersInResourceCache(listOf("abc"))
        assertThatThrownBy {
            config.checkConfiguration()
        }.isInstanceOf(RuntimeConfigurationError::class.java)
            .hasMessage(
                message(
                    "cloud_debug.run_configuration.duplicate_remote_port_same_container",
                    "abc",
                    "1212"
                )
            )
    }

    @Test
    fun validateRemotePathUniquenessSameContainer() {
        val container = makeFakeContainerOptions().apply {
            artifactMappings = listOf(ArtifactMapping("doesn't matter", "/abc"), ArtifactMapping("also doesn't matter", "/abc"))
        }
        val config = buildDefaultConfiguration().also { configuration ->
            configuration.containerOptions(mapOf("abc" to container))
        }
        setFakeContainersInResourceCache(listOf("abc"))
        assertThatThrownBy {
            config.checkConfiguration()
        }.isInstanceOf(RuntimeConfigurationError::class.java)
            .hasMessage(
                message(
                    "cloud_debug.run_configuration.duplicate_remote_artifact",
                    "abc",
                    "/abc"
                )
            )
    }

    @Test
    fun validateRemotePathUniquenessDifferentContainer() {
        val container = makeFakeContainerOptions().apply {
            artifactMappings = listOf(ArtifactMapping("doesn't matter", "/abc"))
        }
        val config = buildDefaultConfiguration().also { configuration ->
            configuration.containerOptions(mapOf("abc" to container))
            configuration.containerOptions(mapOf("bcd" to container))
        }
        setFakeContainersInResourceCache(listOf("abc", "bcd"))
        config.checkConfiguration()
    }

    @Test
    fun validateWarningWhenCopyingToRoot() {
        val container = makeFakeContainerOptions().apply {
            artifactMappings = listOf(ArtifactMapping("doesn't matter", "/"))
        }
        val config = buildDefaultConfiguration().also { configuration ->
            configuration.containerOptions(mapOf("abc" to container))
            configuration.containerOptions(mapOf("bcd" to container))
        }
        setFakeContainersInResourceCache(listOf("abc", "bcd"))
        assertThatThrownBy {
            config.checkConfiguration()
        }.isInstanceOf(RuntimeConfigurationWarning::class.java)
            .hasMessage(
                message(
                    "cloud_debug.run_configuration.potential_data_loss",
                    "bcd"
                )
            )
    }

    @Test
    fun validateErrorWhenContainerDoesntExist() {
        val container = makeFakeContainerOptions().apply {
            artifactMappings = listOf(ArtifactMapping("doesn't matter", "/"))
        }
        val config = buildDefaultConfiguration().also { configuration ->
            configuration.containerOptions(mapOf("abc" to container))
            configuration.containerOptions(mapOf("bcd" to container))
        }
        setFakeContainersInResourceCache(listOf("abc"))
        assertThatThrownBy {
            config.checkConfiguration()
        }.isInstanceOf(RuntimeConfigurationError::class.java)
            .hasMessage(
                message(
                    "cloud_debug.ecs.run_config.container.doesnt_exist_in_service",
                    "bcd",
                    "arn"
                )
            )
    }

    @Test
    fun validateErrorWhenServiceDoesntExist() {
        val config = buildDefaultConfiguration().also { configuration ->
            configuration.serviceArn("notarealservice")
        }

        val future = CompletableFuture<Service>()
        future.completeExceptionally(ServiceNotFoundException.builder().message("Service doesn't exist").build())
        MockResourceCache.getInstance(projectRule.project)
            .addEntry(EcsResources.describeService("arn", "notarealservice"), defaultRegion, mockCredentials.id, future)

        assertThatThrownBy {
            config.checkConfiguration()
        }.isInstanceOf(RuntimeConfigurationError::class.java)
            .hasMessageContaining(
                // doesn't match real string because we're testing against a mock
                "Service doesn't exist"
            )
    }

    @Test
    fun validateSucceedsBeforeRequired() {
        val config = buildDefaultConfiguration()
        config.checkConfiguration()
    }

    private fun getCloudDebugRunningState(configuration: EcsCloudDebugRunConfiguration): CloudDebugRunState? {
        val executor = ExecutorRegistry.getInstance().getExecutorById(DefaultRunExecutor.EXECUTOR_ID)
        assertNotNull(executor)
        val environment = ExecutionEnvironmentBuilder.create(
            DefaultDebugExecutor.getDebugExecutorInstance(),
            configuration
        ).build()

        return configuration.getState(executor, environment)
    }

    private fun buildDefaultConfiguration(): EcsCloudDebugRunConfiguration {
        val configuration = EcsCloudDebugRunConfiguration(
            projectRule.project,
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
        containerOptions.platform = CloudDebuggingPlatform.JVM
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
        val resourceCache = MockResourceCache.getInstance(projectRule.project)
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
