// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.ecr

import com.intellij.docker.DockerCloudConfiguration
import com.intellij.docker.DockerCloudType
import com.intellij.docker.DockerDeploymentConfiguration
import com.intellij.docker.DockerServerRuntimeInstance
import com.intellij.docker.agent.DockerAgentApplication
import com.intellij.docker.deploymentSource.DockerFileDeploymentSourceType
import com.intellij.docker.registry.DockerRegistry
import com.intellij.docker.registry.DockerRepositoryModel
import com.intellij.docker.runtimes.DockerApplicationRuntime
import com.intellij.execution.RunManager
import com.intellij.execution.RunnerAndConfigurationSettings
import com.intellij.execution.executors.DefaultRunExecutor
import com.intellij.execution.runners.ExecutionEnvironmentBuilder
import com.intellij.openapi.application.ModalityState
import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.project.Project
import com.intellij.remoteServer.configuration.RemoteServer
import com.intellij.remoteServer.configuration.RemoteServersManager
import com.intellij.remoteServer.configuration.deployment.DeploymentConfiguration
import com.intellij.remoteServer.impl.configuration.RemoteServerImpl
import com.intellij.remoteServer.impl.configuration.deployment.DeployToServerRunConfiguration
import com.intellij.remoteServer.impl.runtime.deployment.DeploymentTaskImpl
import com.intellij.remoteServer.runtime.Deployment
import com.intellij.remoteServer.runtime.ServerConnection
import com.intellij.remoteServer.runtime.ServerConnectionManager
import com.intellij.remoteServer.runtime.ServerConnector
import com.intellij.remoteServer.runtime.deployment.DeploymentStatus
import com.intellij.remoteServer.runtime.deployment.DeploymentTask
import com.intellij.remoteServer.runtime.deployment.ServerRuntimeInstance
import com.intellij.remoteServer.runtime.ui.RemoteServersView
import com.intellij.util.Base64
import kotlinx.coroutines.delay
import kotlinx.coroutines.future.await
import kotlinx.coroutines.withContext
import org.jetbrains.concurrency.AsyncPromise
import org.jetbrains.concurrency.await
import software.amazon.awssdk.services.ecr.model.AuthorizationData
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.jetbrains.services.ecr.actions.LocalImage
import software.aws.toolkits.jetbrains.services.ecr.resources.Repository
import software.aws.toolkits.jetbrains.utils.getCoroutineUiContext
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

    suspend fun getDockerServerRuntimeInstance(server: RemoteServer<DockerCloudConfiguration>? = null): DockerConnection {
        val instancePromise = AsyncPromise<DockerServerRuntimeInstance>()
        val connection = server?.let {
            withContext(getCoroutineUiContext(ModalityState.any())) {
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

    suspend fun getDockerApplicationRuntimeInstance(serverRuntime: DockerServerRuntimeInstance, imageId: String): DockerApplicationRuntime =
        serverRuntime.findRuntimeLater(imageId, false).await()

    suspend fun pushImage(project: Project, ecrLogin: EcrLogin, pushRequest: EcrPushRequest) {
        when (pushRequest) {
            is DockerfileEcrPushRequest -> {
                LOG.debug("Building Docker image from ${pushRequest.dockerBuildConfiguration}")
                buildAndPushDockerfile(project, ecrLogin, pushRequest)
            }
            is ImageEcrPushRequest -> {
                LOG.debug("Pushing '${pushRequest.localImageId}' to ECR")
                val (username, password) = ecrLogin
                val model = DockerRepositoryModel().also {
                    val repoUri = pushRequest.remoteRepo.repositoryUri
                    it.registry = DockerRegistry().also { registry ->
                        registry.address = repoUri
                        registry.username = username
                        registry.password = password
                    }
                    it.repository = repoUri
                    it.tag = pushRequest.remoteTag
                }

                val dockerApplicationRuntime = getDockerApplicationRuntimeInstance(pushRequest.dockerServerRuntime, pushRequest.localImageId)
                dockerApplicationRuntime.pushImage(project, model)
            }
        }
    }

    private suspend fun buildAndPushDockerfile(project: Project, ecrLogin: EcrLogin, pushRequest: DockerfileEcrPushRequest) {
        val (runConfiguration, remoteRepo, remoteTag) = pushRequest
        // use connection specified in run configuration
        val server = RemoteServersManager.getInstance().findByName(runConfiguration.serverName, runConfiguration.serverType)
        val (serverConnection, dockerRuntime) = getDockerServerRuntimeInstance(server)

        // prep the "deployment" that will build the Dockerfile
        val execEnviron = ExecutionEnvironmentBuilder.create(DefaultRunExecutor.getRunExecutorInstance(), runConfiguration).build()
        val dockerConfig = (runConfiguration.deploymentConfiguration as DockerDeploymentConfiguration)
        val wasBuildOnly = dockerConfig.isBuildOnly
        dockerConfig.isBuildOnly = true
        // upcasting here to avoid type mismatch/unchecked cast warning on 'deploy' invocation
        val task: DeploymentTask<DeploymentConfiguration> = DeploymentTaskImpl(
            runConfiguration.deploymentSource,
            runConfiguration.deploymentConfiguration,
            project,
            null,
            execEnviron
        )

        // check we don't have something running
        val expectedDeploymentName = dockerRuntime.getDeploymentName(runConfiguration.deploymentSource, runConfiguration.deploymentConfiguration)
        if (serverConnection.deployments.firstOrNull { it.name == expectedDeploymentName && it.status == DeploymentStatus.DEPLOYING } != null) {
            notifyError(message("ecr.push.title"), message("ecr.push.in_progress"))
            return
        }

        // unfortunately no callbacks available to grab the Deployment instance
        val deploymentPromise = AsyncPromise<Deployment>()
        serverConnection.deploy(task) { deploymentName ->
            LOG.debug("Retrieving Deployment associated with '$deploymentName'")
            RemoteServersView.getInstance(project).showDeployment(serverConnection, deploymentName)
            runInEdt {
                deploymentPromise.setResult(serverConnection.deployments.first { it.name == deploymentName })
            }
        }

        // seems gross but this is cleaner than manually attempting to expose the build logs to the user
        val deployment = deploymentPromise.await()
        // TODO: why doesn't logging to this log handler do anything?
        val logHandler = deployment.getOrCreateLogManager(project).mainLoggingHandler

        // unfortunately no callbacks available to grab failure
        while (deployment.status == DeploymentStatus.DEPLOYING) {
            delay(100)
        }

        if (deployment.status != DeploymentStatus.DEPLOYED) {
            notifyError(message("ecr.push.title"), message("ecr.push.failed", deployment.statusText))
            return
        }

        val runtime = deployment.runtime as? DockerApplicationRuntime
        if (runtime == null) {
            notifyError(message("ecr.push.title"), message("ecr.push.failed", deployment.statusText))
            return
        }

        if (!wasBuildOnly) {
            LOG.debug("Configuration specified additional 'run' parameters in Dockerfile that will be ignored")
            logHandler.print("Skipping 'Run' portion of Dockerfile build configuration\n")
        }

        // find the built image and send to ECR
        val imageIdPrefix = runtime.agentApplication.imageId
        LOG.debug("Finding built image with prefix '$imageIdPrefix'")
        val imageId = runtime.agent.getImages(null).first { it.imageId.startsWith("sha256:$imageIdPrefix") }.imageId
        LOG.debug("Found image with full id '$imageId'")
        logHandler.print("Deploying $imageId to ECR\n")

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
            deploymentConfiguration.isBuildOnly = true
            onNewConfigurationCreated()
        }

        runManager.addConfiguration(settings)

        return settings
    }
}

private const val NO_TAG_TAG = "<none>:<none>"
internal fun Array<DockerAgentApplication>.toLocalImageList(): List<LocalImage> =
    this.flatMap { image ->
        image.imageRepoTags?.map { localTag ->
            val tag = localTag.takeUnless { it == NO_TAG_TAG }
            LocalImage(image.imageId, tag)
        } ?: listOf(LocalImage(image.imageId, null))
    }.toList()

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
