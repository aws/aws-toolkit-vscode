// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.ecr

import com.intellij.docker.agent.DockerAgentApplication
import com.intellij.util.Base64
import org.assertj.core.api.Assertions.assertThat
import org.junit.Test
import org.mockito.kotlin.mock
import org.mockito.kotlin.whenever
import software.amazon.awssdk.services.ecr.model.AuthorizationData
import software.aws.toolkits.core.utils.RuleUtils
import software.aws.toolkits.jetbrains.services.ecr.actions.LocalImage

class EcrUtilsTest {
    @Test
    fun toLocalImageList() {
        val images = arrayOf(
            mockDockerApplication("sha256:nulltag", null),
            mockDockerApplication("sha256:nonetag", arrayOf("<none>:<none>")),
            mockDockerApplication("sha256:singletag", arrayOf("tag")),
            mockDockerApplication("sha256:multipletags", arrayOf("tag1", "remote:tag2")),
        ).toLocalImageList()

        assertThat(images).containsExactly(
            LocalImage("sha256:nulltag", null),
            LocalImage("sha256:nonetag", null),
            LocalImage("sha256:singletag", "tag"),
            LocalImage("sha256:multipletags", "tag1"),
            LocalImage("sha256:multipletags", "remote:tag2")
        )
    }

    @Test
    fun getDockerLogin() {
        val authData: AuthorizationData = mock()
        val user = RuleUtils.randomName()

        whenever(authData.authorizationToken()).thenReturn(Base64.encode("$user:password".toByteArray()))
        val (user1, pass1) = authData.getDockerLogin()
        assertThat(user1).isEqualTo(user)
        assertThat(pass1).isEqualTo("password")

        whenever(authData.authorizationToken()).thenReturn(Base64.encode("$user:::::::password".toByteArray()))
        val (user2, pass2) = authData.getDockerLogin()
        assertThat(user2).isEqualTo(user)
        assertThat(pass2).isEqualTo("::::::password")

        whenever(authData.authorizationToken()).thenReturn(Base64.encode("$user:aGVsbG8=".toByteArray()))
        val (user3, pass3) = authData.getDockerLogin()
        assertThat(user3).isEqualTo(user)
        assertThat(pass3).isEqualTo("aGVsbG8=")
    }

    private fun mockDockerApplication(imageId: String, tags: Array<String>?): DockerAgentApplication {
        val mock: DockerAgentApplication = mock()
        whenever(mock.imageId).thenReturn(imageId)
        whenever(mock.imageRepoTags).thenReturn(tags)

        return mock
    }
}
