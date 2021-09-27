// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.docker

import com.intellij.docker.DockerAgentPathMapperImpl
import com.intellij.docker.DockerServerRuntimeInstance
import com.intellij.docker.registry.DockerRepositoryModel
import com.intellij.docker.remote.run.runtime.DockerAgentBuildImageConfig
import com.intellij.openapi.project.Project
import com.intellij.remoteServer.util.CloudSilentLoggingHandlerImpl
import kotlinx.coroutines.future.await
import java.io.File

class ToolkitDockerAdapter(project: Project, serverRuntime: DockerServerRuntimeInstance) : AbstractToolkitDockerAdapter(project, serverRuntime) {
    override fun buildLocalImage(dockerfile: File): String? {
        val deployment = serverRuntime.agent.createDeployment(
            DockerAgentBuildImageConfig(System.currentTimeMillis().toString(), dockerfile, false),
            CloudSilentLoggingHandlerImpl(project),
            DockerAgentPathMapperImpl(project)
        )

        return deployment.deploy("untagged image")?.imageId
    }

    override suspend fun pushImage(localTag: String, config: DockerRepositoryModel) {
        val physicalLocalRuntime = serverRuntime.findRuntimeLater(localTag, false).await()
        physicalLocalRuntime.pushImage(project, config)
    }
}
