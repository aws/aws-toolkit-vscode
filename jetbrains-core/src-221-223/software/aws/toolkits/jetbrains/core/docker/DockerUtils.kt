// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.docker

import com.intellij.docker.DockerCloudConfiguration
import com.intellij.docker.DockerCloudType
import com.intellij.docker.DockerServerRuntimeInstance
import com.intellij.docker.agent.DockerAgent
import com.intellij.docker.registry.DockerRepositoryModel
import com.intellij.docker.runtimes.DockerImageRuntime
import com.intellij.openapi.project.Project
import com.intellij.remoteServer.configuration.RemoteServer
import com.intellij.remoteServer.configuration.deployment.DeploymentConfiguration
import com.intellij.remoteServer.impl.configuration.RemoteServerImpl
import com.intellij.remoteServer.runtime.ServerConnectionManager
import com.intellij.remoteServer.runtime.ServerConnector
import com.intellij.remoteServer.runtime.deployment.ServerRuntimeInstance
import kotlinx.coroutines.future.await
import kotlinx.coroutines.withContext
import org.jetbrains.concurrency.AsyncPromise
import org.jetbrains.concurrency.await
import software.aws.toolkits.jetbrains.core.coroutines.getCoroutineUiContext
import java.util.concurrent.CompletableFuture

private fun defaultDockerConnection() = ServerConnectionManager.getInstance().createTemporaryConnection(
    RemoteServerImpl("DockerConnection", DockerCloudType.getInstance(), DockerCloudConfiguration.createDefault())
)

suspend fun getDockerServerRuntimeFacade(project: Project, server: RemoteServer<DockerCloudConfiguration>? = null): DockerRuntimeFacade {
    val instancePromise = AsyncPromise<DockerServerRuntimeInstance>()
    val connection = server?.let {
        withContext(getCoroutineUiContext()) {
            ServerConnectionManager.getInstance().getOrCreateConnection(server)
        }
    } ?: defaultDockerConnection()

    connection.connectIfNeeded(object : ServerConnector.ConnectionCallback<DeploymentConfiguration> {
        override fun errorOccurred(errorMessage: String) {
            instancePromise.setError(errorMessage)
        }

        override fun connected(serverRuntimeInstance: ServerRuntimeInstance<DeploymentConfiguration>) {
            instancePromise.setResult(serverRuntimeInstance as DockerServerRuntimeInstance)
        }
    })

    val runtime = instancePromise.await()
    return object : DockerRuntimeFacade {
        override val agent: DockerAgent
            get() = runtime.agent

        override suspend fun pushImage(imageId: String, config: DockerRepositoryModel): CompletableFuture<Unit> {
            val physicalLocalRuntime = runtime.findRuntimeLater(imageId, false).await()
            (physicalLocalRuntime as? DockerImageRuntime)?.pushImage(project, config) ?: error { "couldn't map tag to appropriate docker runtime" }

            return CompletableFuture.completedFuture(Unit)
        }
    }
}
