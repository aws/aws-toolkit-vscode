// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.docker

import com.intellij.docker.DockerDeploymentConfiguration
import com.intellij.docker.agent.DockerAgent
import com.intellij.docker.agent.DockerAgentDeploymentConfig
import com.intellij.docker.agent.DockerAgentProgressCallback
import com.intellij.docker.agent.DockerAgentSourceType
import com.intellij.docker.agent.progress.DockerResponseItem
import com.intellij.docker.registry.DockerAgentRepositoryConfigImpl
import com.intellij.docker.registry.DockerRepositoryModel
import com.intellij.docker.remote.run.runtime.DockerAgentDeploymentConfigImpl
import com.intellij.openapi.progress.ProgressIndicator
import com.intellij.openapi.progress.Task
import com.intellij.openapi.project.Project
import kotlinx.coroutines.future.await
import kotlinx.coroutines.runBlocking
import org.apache.commons.io.FileUtils
import org.jetbrains.annotations.TestOnly
import org.jetbrains.concurrency.await
import software.aws.toolkits.core.utils.debug
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.jetbrains.services.ecr.DockerfileEcrPushRequest
import software.aws.toolkits.jetbrains.utils.notifyError
import software.aws.toolkits.jetbrains.utils.notifyInfo
import software.aws.toolkits.resources.message
import java.io.File
import java.io.ObjectInputStream
import java.time.Instant
import java.util.UUID
import java.util.concurrent.CompletableFuture
import com.intellij.docker.getSourceFile as getDockerfileSourceFile

// it's a facade so imo we shouldn't be leaking impl details but i don't feel like rewriting tests
interface DockerRuntimeFacade {
    val agent: DockerAgent

    suspend fun pushImage(imageId: String, config: DockerRepositoryModel): CompletableFuture<Unit>
}

class ToolkitDockerAdapter(protected val project: Project, val runtimeFacade: DockerRuntimeFacade) {
    internal var agent = runtimeFacade.agent
        @TestOnly
        set

    @TestOnly
    fun buildLocalImage(dockerfile: File): String? {
        val tag = UUID.randomUUID().toString()
        val config = object : DockerAgentDeploymentConfigImpl(tag, null) {
            override fun getFile() = dockerfile

            override fun sourceType() = DockerAgentSourceType.FILE.toString()
        }

        return runBlocking { buildImage(project, agent, config, dockerfile.absolutePath, tag) }
    }

    suspend fun hackyBuildDockerfileWithUi(project: Project, pushRequest: DockerfileEcrPushRequest) =
        hackyBuildDockerfileUnderIndicator(project, pushRequest)

    suspend fun pushImage(imageId: String, config: DockerRepositoryModel) = runtimeFacade.pushImage(imageId, config)

    fun getLocalImages(): List<LocalImage> =
        agent.getImages(null).flatMap { image ->
            @Suppress("UselessCallOnNotNull")
            if (image.imageRepoTags.isNullOrEmpty()) {
                return@flatMap listOf(LocalImage(image.imageId, null))
            }

            image.imageRepoTags.map { localTag ->
                val tag = localTag.takeUnless { it == NO_TAG_TAG }
                LocalImage(image.imageId, tag)
            }
        }.toList()

    fun pullImage(
        config: DockerRepositoryModel,
        progressIndicator: ProgressIndicator? = null
    ) = agent.pullImage(
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
    private suspend fun hackyBuildDockerfileUnderIndicator(project: Project, pushRequest: DockerfileEcrPushRequest): String? {
        val dockerConfig = (pushRequest.dockerBuildConfiguration.deploymentConfiguration as DockerDeploymentConfiguration)
        val tag = dockerConfig.separateImageTags.firstOrNull() ?: Instant.now().toEpochMilli().toString()
        // should never be null
        val dockerfilePath = dockerConfig.sourceFilePath ?: throw RuntimeException("Docker run configuration started with invalid source file")
        val config = object : DockerAgentDeploymentConfigImpl(tag, null) {
            override fun getFile() = project.getDockerfileSourceFile(dockerfilePath)

            override fun sourceType() = DockerAgentSourceType.FILE.toString()

            override fun getCustomContextFolder() =
                dockerConfig.contextFolderPath?.let {
                    File(it)
                } ?: super.getCustomContextFolder()
        }.withEnvs(dockerConfig.envVars.toTypedArray())
            .withBuildArgs(dockerConfig.buildArgs.toTypedArray())

        return buildImage(project, agent, config, dockerfilePath, tag)
    }

    private suspend fun buildImage(
        project: Project,
        agent: DockerAgent,
        config: DockerAgentDeploymentConfig,
        dockerfilePath: String,
        tag: String
    ): String? {
        val queue = agent.createImageBuilder().asyncBuildImage(config).await()
        val future = CompletableFuture<String?>()
        object : Task.Backgroundable(project, message("dockerfile.building", dockerfilePath), true) {
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

                    LOG.debug { message ?: deserialized.toString() }
                }

                future.complete(agent.getImages(null).firstOrNull { it.imageRepoTags.contains("$tag:latest") }?.imageId)
            }
        }.queue()

        return future.await()
    }

    private companion object {
        const val NO_TAG_TAG = "<none>:<none>"

        val LOG = getLogger<ToolkitDockerAdapter>()
    }
}

data class LocalImage(
    val imageId: String,
    val tag: String?
)
