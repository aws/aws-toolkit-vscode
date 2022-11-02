// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.docker

import com.intellij.docker.DockerDeploymentConfiguration
import com.intellij.docker.DockerServerRuntimeInstance
import com.intellij.docker.agent.DockerAgentDeploymentConfig
import com.intellij.docker.agent.DockerAgentProgressCallback
import com.intellij.docker.agent.DockerAgentSourceType
import com.intellij.docker.agent.progress.DockerResponseItem
import com.intellij.docker.registry.DockerAgentRepositoryConfigImpl
import com.intellij.docker.registry.DockerRepositoryModel
import com.intellij.docker.remote.run.runtime.DockerAgentDeploymentConfigImpl
import com.intellij.docker.runtimes.DockerApplicationRuntime
import com.intellij.docker.runtimes.DockerImageRuntime
import com.intellij.execution.executors.DefaultRunExecutor
import com.intellij.execution.runners.ExecutionEnvironmentBuilder
import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.progress.ProgressIndicator
import com.intellij.openapi.progress.Task
import com.intellij.openapi.project.Project
import com.intellij.remoteServer.configuration.RemoteServersManager
import com.intellij.remoteServer.configuration.deployment.DeploymentConfiguration
import com.intellij.remoteServer.impl.runtime.deployment.DeploymentTaskImpl
import com.intellij.remoteServer.runtime.Deployment
import com.intellij.remoteServer.runtime.deployment.DeploymentStatus
import com.intellij.remoteServer.runtime.deployment.DeploymentTask
import com.intellij.remoteServer.runtime.ui.RemoteServersView
import kotlinx.coroutines.delay
import kotlinx.coroutines.future.await
import kotlinx.coroutines.runBlocking
import org.apache.commons.io.FileUtils
import org.jetbrains.annotations.TestOnly
import org.jetbrains.concurrency.AsyncPromise
import org.jetbrains.concurrency.await
import software.aws.toolkits.core.utils.debug
import software.aws.toolkits.core.utils.error
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.jetbrains.services.ecr.DockerfileEcrPushRequest
import software.aws.toolkits.jetbrains.services.ecr.EcrUtils
import software.aws.toolkits.jetbrains.utils.notifyError
import software.aws.toolkits.jetbrains.utils.notifyInfo
import software.aws.toolkits.resources.message
import java.io.File
import java.io.ObjectInputStream
import java.time.Instant
import java.util.UUID
import java.util.concurrent.CompletableFuture

abstract class AbstractToolkitDockerAdapter(protected val project: Project, protected val serverRuntime: DockerServerRuntimeInstance) {
    internal var agent = serverRuntime.agent
        @TestOnly
        set

    @TestOnly
    abstract fun buildLocalImage(dockerfile: File): String?

    open suspend fun hackyBuildDockerfileWithUi(project: Project, pushRequest: DockerfileEcrPushRequest): String? {
        val (runConfiguration, _, _) = pushRequest
        // use connection specified in run configuration
        val server = RemoteServersManager.getInstance().findByName(runConfiguration.serverName, runConfiguration.serverType)
        val (serverConnection, dockerRuntime) = EcrUtils.getDockerServerRuntimeInstance(server)

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
            return null
        }

        // unfortunately no callbacks available to grab the Deployment instance
        val deploymentPromise = AsyncPromise<Deployment>()
        serverConnection.deploy(task) { deploymentName ->
            LOG.debug { "Retrieving Deployment associated with '$deploymentName'" }
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
            return null
        }

        val runtime = deployment.runtime as? DockerApplicationRuntime
        if (runtime == null) {
            notifyError(message("ecr.push.title"), message("ecr.push.failed", deployment.statusText))
            return null
        }

        if (!wasBuildOnly) {
            LOG.debug { "Configuration specified additional 'run' parameters in Dockerfile that will be ignored" }
            logHandler.print("Skipping 'Run' portion of Dockerfile build configuration\n")
        }

        return "sha256:${runtime.imageId}"
    }

    abstract suspend fun pushImage(localTag: String, config: DockerRepositoryModel)

    fun getLocalImages(): List<LocalImage> =
        // TODO: FIX_WHEN_MIN_IS_212: potentially null pre-212
        @Suppress("UNNECESSARY_SAFE_CALL")
        agent.getImages(null)?.flatMap { image ->
            image.imageRepoTags?.map { localTag ->
                val tag = localTag.takeUnless { it == NO_TAG_TAG }
                LocalImage(image.imageId, tag)
            } ?: listOf(LocalImage(image.imageId, null))
        }?.toList() ?: emptyList()

    fun pullImage(
        config: DockerRepositoryModel,
        progressIndicator: ProgressIndicator? = null
    ) = serverRuntime.agent.pullImage(
        DockerAgentRepositoryConfigImpl(config),
        object : DockerAgentProgressCallback {
            // based on RegistryRuntimeTask's impl
            override fun step(status: String, current: Long, total: Long) {
                LOG.debug { "step: status: $status, current: $current, total: $total" }
                progressIndicator?.let { indicator ->
                    val indeterminate = total == 0L
                    indicator.text2 = "$status " +
                        (if (indeterminate) "" else "${FileUtils.byteCountToDisplaySize(current)} of ${FileUtils.byteCountToDisplaySize(total)}")
                    indicator.isIndeterminate = indeterminate
                    if (!indeterminate) {
                        indicator.fraction = current.toDouble() / total.toDouble()
                    }
                }
            }

            override fun succeeded(message: String) {
                LOG.debug { "Pull from ECR succeeded: $message" }
                notifyInfo(
                    project = project,
                    title = software.aws.toolkits.resources.message("ecr.pull.title"),
                    content = message
                )
            }

            override fun failed(message: String) {
                LOG.debug { "Pull from ECR failed: $message" }
                notifyError(
                    project = project,
                    title = software.aws.toolkits.resources.message("ecr.pull.title"),
                    content = message
                )
            }
        }
    )

    // com.intellij.docker.agent.progress.DockerImageBuilder is probably the correct interface to use but need to figure out how to get an instance of it
    protected suspend fun hackyBuildDockerfileUnderIndicator(project: Project, pushRequest: DockerfileEcrPushRequest): String? {
        val dockerConfig = (pushRequest.dockerBuildConfiguration.deploymentConfiguration as DockerDeploymentConfiguration)
        val tag = dockerConfig.separateImageTags.firstOrNull() ?: Instant.now().toEpochMilli().toString()
        // should never be null
        val dockerfilePath = dockerConfig.sourceFilePath ?: throw RuntimeException("Docker run configuration started with invalid source file")
        val config = object : DockerAgentDeploymentConfigImpl(tag, null) {
            override fun getFile() = File(dockerfilePath)

            override fun sourceType() = DockerAgentSourceType.FILE.toString()

            override fun getCustomContextFolder() =
                dockerConfig.contextFolderPath?.let {
                    File(it)
                } ?: super.getCustomContextFolder()
        }.withEnvs(dockerConfig.envVars.toTypedArray())
            .withBuildArgs(dockerConfig.buildArgs.toTypedArray())

        return buildImage(project, serverRuntime, config, dockerfilePath, tag)
    }

    protected suspend fun buildImage(
        project: Project,
        serverRuntime: DockerServerRuntimeInstance,
        config: DockerAgentDeploymentConfig,
        dockerfilePath: String,
        tag: String
    ): String? {
        val queue = serverRuntime.agent.createImageBuilder().asyncBuildImage(config).await()
        val future = CompletableFuture<String?>()
        object : Task.Backgroundable(project, message("dockerfile.building", dockerfilePath), false) {
            override fun run(indicator: ProgressIndicator) {
                indicator.isIndeterminate = true
                while (true) {
                    val obj = queue.take()
                    if (obj.isEmpty()) {
                        break
                    }
                    val deserialized = ObjectInputStream(obj.inputStream()).readObject()
                    val message = (deserialized as? DockerResponseItem)?.stream
                    if (message != null && message.trim().isNotEmpty()) {
                        indicator.text2 = message
                    }

                    AbstractToolkitDockerAdapter.LOG.debug { message ?: deserialized.toString() }
                }

                future.complete(serverRuntime.agent.getImages(null).firstOrNull { it.imageRepoTags.contains("$tag:latest") }?.imageId)
            }
        }.queue()

        return future.await()
    }

    protected companion object {
        const val NO_TAG_TAG = "<none>:<none>"

        val LOG = getLogger<AbstractToolkitDockerAdapter>()
    }
}

// TODO: merge with abstract class
class ToolkitDockerAdapter(project: Project, serverRuntime: DockerServerRuntimeInstance) : AbstractToolkitDockerAdapter(project, serverRuntime) {
    @TestOnly
    override fun buildLocalImage(dockerfile: File): String? {
        val tag = UUID.randomUUID().toString()
        val config = object : DockerAgentDeploymentConfigImpl(tag, null) {
            override fun getFile() = dockerfile

            override fun sourceType() = DockerAgentSourceType.FILE.toString()
        }

        return runBlocking { buildImage(project, serverRuntime, config, dockerfile.absolutePath, tag) }
    }

    override suspend fun hackyBuildDockerfileWithUi(project: Project, pushRequest: DockerfileEcrPushRequest) =
        hackyBuildDockerfileUnderIndicator(project, pushRequest)

    override suspend fun pushImage(localTag: String, config: DockerRepositoryModel) {
        val physicalLocalRuntime = serverRuntime.findRuntimeLater(localTag, false).await()
        (physicalLocalRuntime as? DockerImageRuntime)?.pushImage(project, config) ?: LOG.error { "couldn't map tag to appropriate docker runtime" }
    }

    companion object {
        val LOG = getLogger<ToolkitDockerAdapter>()
    }
}

data class LocalImage(
    val imageId: String,
    val tag: String?
)
