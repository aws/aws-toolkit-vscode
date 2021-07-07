// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.ecr

import com.intellij.docker.DockerCloudConfiguration
import com.intellij.docker.agent.DockerAgentDeploymentConfig
import com.intellij.docker.remote.run.runtime.RemoteDockerApplicationRuntime
import com.intellij.docker.remote.run.runtime.RemoteDockerRuntime
import com.intellij.openapi.project.Project

class DelegatedRemoteDockerApplicationRuntime(project: Project, config: DockerAgentDeploymentConfig) : AbstractRemoteDockerApplicationRuntime() {
    private val delegate = RemoteDockerApplicationRuntime.createWithPullImage(
        RemoteDockerRuntime.create(DockerCloudConfiguration.createDefault(), project),
        config
    )

    override val agent = delegate.agent
    override val agentApplication = delegate.agentApplication
}
