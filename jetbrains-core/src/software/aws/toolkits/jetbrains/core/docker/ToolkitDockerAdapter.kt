// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.docker

import com.intellij.docker.DockerServerRuntimeInstance
import com.intellij.docker.agent.DockerAgentProgressCallback
import com.intellij.docker.registry.DockerAgentRepositoryConfigImpl
import com.intellij.docker.registry.DockerRepositoryModel
import com.intellij.openapi.progress.ProgressIndicator
import com.intellij.openapi.project.Project
import org.apache.commons.io.FileUtils
import org.jetbrains.annotations.TestOnly
import software.aws.toolkits.core.utils.debug
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.jetbrains.utils.notifyError
import software.aws.toolkits.jetbrains.utils.notifyInfo

abstract class AbstractToolkitDockerAdapter(protected val project: Project, protected val serverRuntime: DockerServerRuntimeInstance) {
    internal var agent = serverRuntime.agent
        @TestOnly
        set

    abstract suspend fun pushImage(localTag: String, config: DockerRepositoryModel)

    fun getLocalImages(): List<LocalImage> =
        // potentially null pre-212
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

    protected companion object {
        const val NO_TAG_TAG = "<none>:<none>"

        val LOG = getLogger<AbstractToolkitDockerAdapter>()
    }
}

data class LocalImage(
    val imageId: String,
    val tag: String?
)
