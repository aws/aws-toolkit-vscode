// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.docker

import com.intellij.docker.DockerServerRuntimeInstance
import com.intellij.docker.registry.DockerRepositoryModel
import com.intellij.docker.runtimes.DockerImageRuntime
import com.intellij.openapi.project.Project
import kotlinx.coroutines.future.await
import software.aws.toolkits.core.utils.error

class ToolkitDockerAdapter(project: Project, serverRuntime: DockerServerRuntimeInstance) : AbstractToolkitDockerAdapter(project, serverRuntime) {
    override suspend fun pushImage(localTag: String, config: DockerRepositoryModel) {
        val physicalLocalRuntime = serverRuntime.findRuntimeLater(localTag, false).await()
        (physicalLocalRuntime as? DockerImageRuntime)?.pushImage(project, config) ?: LOG.error { "couldn't map tag to appropriate docker runtime" }
    }
}
