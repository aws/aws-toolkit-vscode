// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.docker

import com.intellij.docker.agent.DockerAgent
import kotlinx.coroutines.runBlocking
import org.assertj.core.api.Assertions.assertThat
import org.junit.Before
import org.junit.Test
import org.mockito.kotlin.mock
import org.mockito.kotlin.whenever

class ToolkitDockerAdapterTest {
    private lateinit var sut: ToolkitDockerAdapter
    private lateinit var agent: DockerAgent

    @Before
    fun setUp() {
        agent = mock()
        sut = ToolkitDockerAdapter(mock(), mock()).also {
            it.agent = agent
        }
    }

    @Test
    fun toLocalImageList() {
        val mocks = arrayOf(
            mockDockerApplication("sha256:nulltag", null),
            mockDockerApplication("sha256:nonetag", arrayOf("<none>:<none>")),
            mockDockerApplication("sha256:singletag", arrayOf("tag")),
            mockDockerApplication("sha256:multipletags", arrayOf("tag1", "remote:tag2")),
        )

        // can't declare mocks inline for thenReturn
        whenever(agent.getImages(null)).thenReturn(mocks)

        runBlocking {
            assertThat(sut.getLocalImages()).containsExactly(
                LocalImage("sha256:nulltag", null),
                LocalImage("sha256:nonetag", null),
                LocalImage("sha256:singletag", "tag"),
                LocalImage("sha256:multipletags", "tag1"),
                LocalImage("sha256:multipletags", "remote:tag2")
            )
        }
    }
}
