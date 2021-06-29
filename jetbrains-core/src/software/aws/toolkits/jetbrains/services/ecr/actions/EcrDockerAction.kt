// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.ecr.actions

import com.intellij.docker.DockerServerRuntimeInstance
import com.intellij.openapi.project.DumbAware
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Deferred
import kotlinx.coroutines.async
import software.aws.toolkits.jetbrains.core.explorer.actions.SingleExplorerNodeAction
import software.aws.toolkits.jetbrains.services.ecr.EcrRepositoryNode
import software.aws.toolkits.jetbrains.services.ecr.EcrUtils

abstract class EcrDockerAction :
    SingleExplorerNodeAction<EcrRepositoryNode>(),
    DumbAware {
    abstract val coroutineScope: CoroutineScope
    protected val dockerServerRuntime by lazy { coroutineScope.dockerServerRuntimeAsync() }

    protected companion object {
        fun CoroutineScope.dockerServerRuntimeAsync(): Deferred<DockerServerRuntimeInstance> =
            async(start = CoroutineStart.LAZY) { EcrUtils.getDockerServerRuntimeInstance().runtimeInstance }
    }
}
