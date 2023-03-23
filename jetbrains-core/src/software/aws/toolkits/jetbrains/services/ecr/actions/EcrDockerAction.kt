// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.ecr.actions

import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.project.Project
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Deferred
import kotlinx.coroutines.async
import software.aws.toolkits.jetbrains.core.docker.DockerRuntimeFacade
import software.aws.toolkits.jetbrains.core.docker.getDockerServerRuntimeFacade
import software.aws.toolkits.jetbrains.core.explorer.actions.SingleExplorerNodeAction
import software.aws.toolkits.jetbrains.services.ecr.EcrRepositoryNode

abstract class EcrDockerAction :
    SingleExplorerNodeAction<EcrRepositoryNode>(),
    DumbAware {

    protected companion object {
        fun CoroutineScope.dockerServerRuntimeAsync(project: Project): Deferred<DockerRuntimeFacade> =
            async(start = CoroutineStart.LAZY) { getDockerServerRuntimeFacade(project) }
    }
}
