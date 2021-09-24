// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.docker

import com.intellij.docker.agent.DockerAgentApplication
import org.mockito.kotlin.mock
import org.mockito.kotlin.whenever

fun mockDockerApplication(imageId: String, tags: Array<String>?): DockerAgentApplication {
    val mock = mock<DockerAgentApplication>()
    whenever(mock.imageId).thenReturn(imageId)
    whenever(mock.imageRepoTags).thenReturn(tags)

    return mock
}
