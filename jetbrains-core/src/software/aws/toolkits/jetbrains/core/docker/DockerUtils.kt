// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.docker

import com.intellij.docker.DockerCloudConfiguration
import com.intellij.docker.DockerCloudType
import com.intellij.docker.DockerServerRuntimesManager
import com.intellij.docker.agent.DockerAgent
import com.intellij.docker.registry.DockerRepositoryModel
import com.intellij.openapi.project.Project
import com.intellij.remoteServer.configuration.RemoteServer
import com.intellij.remoteServer.impl.configuration.RemoteServerImpl
import kotlinx.coroutines.future.await
import java.util.concurrent.CompletableFuture

private fun defaultDockerConnection() = RemoteServerImpl("DockerConnection", DockerCloudType.getInstance(), DockerCloudConfiguration.createDefault())

suspend fun getDockerServerRuntimeFacade(project: Project, server: RemoteServer<DockerCloudConfiguration>? = null): DockerRuntimeFacade {
    val connectionConfig = server ?: defaultDockerConnection()
    val runtime = DockerServerRuntimesManager.getInstance(project).getOrCreateConnection(connectionConfig).await()

    return object : DockerRuntimeFacade {
        override val agent: DockerAgent
            get() = runtime.agent

        override suspend fun pushImage(imageId: String, config: DockerRepositoryModel): CompletableFuture<Unit> {
            val imageRuntime = runtime.runtimesManager.images[imageId]
            return imageRuntime?.push(project, config) ?: error("couldn't map tag to appropriate docker runtime")
        }
    }
}
