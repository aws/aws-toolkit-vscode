// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.ecr

import com.intellij.docker.agent.DockerAgent
import com.intellij.docker.agent.DockerAgentApplication

abstract class AbstractRemoteDockerApplicationRuntime {
    abstract val agent: DockerAgent
    abstract val agentApplication: DockerAgentApplication
}
