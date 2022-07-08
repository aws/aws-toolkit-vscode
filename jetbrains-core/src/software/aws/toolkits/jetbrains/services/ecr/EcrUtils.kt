// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.ecr

import com.intellij.docker.DockerCloudConfiguration
import com.intellij.docker.DockerCloudType
import com.intellij.docker.DockerDeploymentConfiguration
import com.intellij.docker.DockerServerRuntimeInstance
import com.intellij.docker.deploymentSource.DockerFileDeploymentSourceType
import com.intellij.docker.registry.DockerRepositoryModel
import com.intellij.execution.RunManager
import com.intellij.execution.RunnerAndConfigurationSettings
import com.intellij.openapi.project.Project
import com.intellij.remoteServer.configuration.RemoteServer
import com.intellij.remoteServer.configuration.RemoteServersManager
import com.intellij.remoteServer.configuration.deployment.DeploymentConfiguration
import com.intellij.remoteServer.impl.configuration.RemoteServerImpl
import com.intellij.remoteServer.impl.configuration.deployment.DeployToServerRunConfiguration
import com.intellij.remoteServer.runtime.ServerConnection
import com.intellij.remoteServer.runtime.ServerConnectionManager
import com.intellij.remoteServer.runtime.ServerConnector
import com.intellij.remoteServer.runtime.deployment.ServerRuntimeInstance
import com.intellij.util.Base64
import kotlinx.coroutines.withContext
import org.jetbrains.concurrency.AsyncPromise
import org.jetbrains.concurrency.await
import software.amazon.awssdk.services.ecr.model.AuthorizationData
import software.aws.toolkits.core.utils.debug
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.jetbrains.core.coroutines.getCoroutineUiContext
import software.aws.toolkits.jetbrains.core.docker.ToolkitDockerAdapter
import software.aws.toolkits.jetbrains.core.docker.compatability.DockerRegistry
import software.aws.toolkits.jetbrains.services.ecr.resources.Repository
import software.aws.toolkits.jetbrains.utils.notifyError
import software.aws.toolkits.resources.message
import software.amazon.awssdk.services.ecr.model.Repository as SdkRepository

typealias DockerRunConfiguration = DeployToServerRunConfiguration<DockerCloudConfiguration, DockerDeploymentConfiguration>

data class EcrLogin(
    val username: String,
    val password: String
) {
    override fun toString() = "EcrLogin@${hashCode()}"
}

sealed class EcrPushRequest
data class ImageEcrPushRequest(
    val dockerServerRuntime: DockerServerRuntimeInstance,
    val localImageId: String,
    val remoteRepo: Repository,
    val remoteTag: String
) : EcrPushRequest()

data class DockerfileEcrPushRequest(
    val dockerBuildConfiguration: DockerRunConfiguration,
    val remoteRepo: Repository,
    val remoteTag: String
) : EcrPushRequest()

data class DockerConnection(
    val serverConnection: ServerConnection<DeploymentConfiguration>,
    val runtimeInstance: DockerServerRuntimeInstance
)

object EcrUtils {
    val LOG = getLogger<EcrUtils>()

    private fun getTemporaryDockerConnection() = ServerConnectionManager.getInstance().createTemporaryConnection(
        RemoteServerImpl("DockerConnection", DockerCloudType.getInstance(), DockerCloudConfiguration.createDefault())
    )

    fun buildDockerRepositoryModel(ecrLogin: EcrLogin?, repository: Repository, tag: String) = DockerRepositoryModel().also {
        val repoUri = repository.repositoryUri
        it.repository = repoUri
        it.tag = tag
        it.registry = DockerRegistry()
        it.registry.address = repoUri
        ecrLogin?.let { login ->
            val (username, password) = login
            it.registry.username = username
            it.registry.password = password
        }
    }

    suspend fun getDockerServerRuntimeInstance(server: RemoteServer<DockerCloudConfiguration>? = null): DockerConnection {
        val instancePromise = AsyncPromise<DockerServerRuntimeInstance>()
        val connection = server?.let {
            withContext(getCoroutineUiContext()) {
                ServerConnectionManager.getInstance().getOrCreateConnection(server)
            }
        } ?: getTemporaryDockerConnection()

        connection.connectIfNeeded(object : ServerConnector.ConnectionCallback<DeploymentConfiguration> {
            override fun errorOccurred(errorMessage: String) {
                instancePromise.setError(errorMessage)
            }

            override fun connected(serverRuntimeInstance: ServerRuntimeInstance<DeploymentConfiguration>) {
                instancePromise.setResult(serverRuntimeInstance as DockerServerRuntimeInstance)
            }
        })

        return DockerConnection(connection, instancePromise.await())
    }

    suspend fun pushImage(project: Project, ecrLogin: EcrLogin, pushRequest: EcrPushRequest) {
        when (pushRequest) {
            is DockerfileEcrPushRequest -> {
                LOG.debug { "Building Docker image from ${pushRequest.dockerBuildConfiguration}" }
                buildAndPushDockerfile(project, ecrLogin, pushRequest)
            }
            is ImageEcrPushRequest -> {
                LOG.debug { "Pushing '${pushRequest.localImageId}' to ECR" }
                val model = buildDockerRepositoryModel(ecrLogin, pushRequest.remoteRepo, pushRequest.remoteTag)
                ToolkitDockerAdapter(project, pushRequest.dockerServerRuntime).pushImage(pushRequest.localImageId, model)
            }
        }
    }

    private suspend fun buildAndPushDockerfile(project: Project, ecrLogin: EcrLogin, pushRequest: DockerfileEcrPushRequest) {
        val (runConfiguration, remoteRepo, remoteTag) = pushRequest
        // use connection specified in run configuration
        val server = RemoteServersManager.getInstance().findByName(runConfiguration.serverName, runConfiguration.serverType)
        val (_, dockerRuntime) = getDockerServerRuntimeInstance(server)

        // find the built image and send to ECR
        val imageIdPrefix = ToolkitDockerAdapter(project, dockerRuntime).hackyBuildDockerfileWithUi(project, pushRequest)
        if (imageIdPrefix == null) {
            notifyError(message("ecr.push.title"), message("ecr.push.unknown_exception"))
            return
        }

        LOG.debug { "Finding built image with prefix '$imageIdPrefix'" }
        val imageId = dockerRuntime.agent.getImages(null).first { it.imageId.startsWith(imageIdPrefix) }.imageId
        LOG.debug { "Found image with full id '$imageId'" }

        pushImage(project, ecrLogin, ImageEcrPushRequest(dockerRuntime, imageId, remoteRepo, remoteTag))
    }

    fun dockerRunConfigurationFromPath(project: Project, configurationName: String, path: String): RunnerAndConfigurationSettings {
        val remoteServersManager = RemoteServersManager.getInstance()
        val dockerServerType = DockerCloudType.getInstance()
        if (remoteServersManager.getServers(dockerServerType).isEmpty()) {
            // add the default configuration if one doesn't exist
            remoteServersManager.addServer(remoteServersManager.createServer(dockerServerType))
        }

        val runManager = RunManager.getInstance(project)
        val factory = DockerCloudType.getRunConfigurationType().getFactoryForType(DockerFileDeploymentSourceType.getInstance())
        val settings = runManager.createConfiguration(configurationName, factory)
        val configurator = DockerCloudType.getInstance().createDeploymentConfigurator(project)
        (settings.configuration as DockerRunConfiguration).apply {
            val sourceType = DockerFileDeploymentSourceType.getInstance()
            deploymentSource = sourceType.singletonSource
            deploymentConfiguration = configurator.createDefaultConfiguration(deploymentSource)
            suggestedName()?.let { name = it }
            deploymentConfiguration.sourceFilePath = path
            onNewConfigurationCreated()
        }

        runManager.addConfiguration(settings)

        return settings
    }
}

fun AuthorizationData.getDockerLogin(): EcrLogin {
    // service returns token as base64-encoded string with the format 'user:password'
    val auth = Base64.decode(this.authorizationToken()).toString(Charsets.UTF_8).split(':', limit = 2)

    return EcrLogin(
        auth.first(),
        auth.last()
    )
}

fun SdkRepository.toToolkitEcrRepository(): Repository? {
    val name = repositoryName() ?: return null
    val arn = repositoryArn() ?: return null
    val uri = repositoryUri() ?: return null

    return Repository(name, arn, uri)
}
