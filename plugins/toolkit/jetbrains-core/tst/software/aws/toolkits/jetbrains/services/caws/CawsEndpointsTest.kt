// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.caws

import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test

class CawsEndpointsTest {
    @Test
    fun `isCawsGit returns true for prod-like`() {
        assertThat(CawsEndpoints.isCawsGit("https://git.us-west-2.codecatalyst.aws/v1/a/b/c")).isTrue()
        assertThat(CawsEndpoints.isCawsGit("https://user@git.us-west-2.codecatalyst.aws/v1/a/b/c")).isTrue()
        assertThat(CawsEndpoints.isCawsGit("https://user@git.eu-west-1.codecatalyst.aws/v1/a/b/c")).isTrue()
    }

    @Test
    fun `isCawsGit returns true for gamma-like`() {
        assertThat(CawsEndpoints.isCawsGit("https://git.a.something.aws.dev/v1/a/b/c")).isTrue()
        assertThat(CawsEndpoints.isCawsGit("https://user@git.gamma.something.aws.dev/v1/a/b/c")).isTrue()
    }

    @Test
    fun `isCawsGit returns false for non-caws`() {
        assertThat(CawsEndpoints.isCawsGit("https://example.com")).isFalse()
    }

    @Test
    fun `isCawsGit returns false for malformed`() {
        assertThat(CawsEndpoints.isCawsGit("<>^`{|}")).isFalse()
        assertThat(CawsEndpoints.isCawsGit("something")).isFalse()
        assertThat(CawsEndpoints.isCawsGit("127.0.0.1")).isFalse()
    }
}
