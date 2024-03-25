// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials.sso.bearer

import org.assertj.core.api.Assertions.assertThat
import org.junit.Test
import software.aws.toolkits.jetbrains.core.credentials.sso.AccessToken
import java.time.Instant

class BearerTokenProviderTest {
    private val sut = { token: AccessToken? -> BearerTokenProvider.state(token) }

    @Test
    fun `state is NOT_AUTHENTICATED if there is no token`() {
        assertThat(sut(null)).isEqualTo(BearerTokenAuthState.NOT_AUTHENTICATED)
    }

    @Test
    fun `state is NOT_AUTHENTICATED if expired token doesn't have refresh token`() {
        val token = anAccessToken(null, Instant.now().minusSeconds(10))
        assertThat(sut(token)).isEqualTo(BearerTokenAuthState.NOT_AUTHENTICATED)
    }

    @Test
    fun `state is NEEDS_REFRESH if expired token has refresh token`() {
        val token = anAccessToken(expiresAt = Instant.now().minusSeconds(10))
        assertThat(sut(token)).isEqualTo(BearerTokenAuthState.NEEDS_REFRESH)
    }

    @Test
    fun `state is AUTHORIZED if token is currently valid`() {
        val token = anAccessToken(null, Instant.now().plusSeconds(10))
        assertThat(sut(token)).isEqualTo(BearerTokenAuthState.AUTHORIZED)
    }
}
