// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials.profiles

import com.intellij.testFramework.ApplicationExtension
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.junit.jupiter.api.extension.ExtendWith
import org.junit.jupiter.api.extension.RegisterExtension
import org.mockito.kotlin.mock
import software.amazon.awssdk.services.ssooidc.SsoOidcClient
import software.amazon.awssdk.services.ssooidc.model.SsoOidcException
import software.aws.toolkits.jetbrains.core.MockClientManagerExtension
import software.aws.toolkits.jetbrains.core.credentials.sso.DiskCache
import software.aws.toolkits.jetbrains.core.credentials.sso.bearer.InteractiveBearerTokenProvider
import software.aws.toolkits.jetbrains.core.credentials.sso.bearer.NoTokenInitializedException

@ExtendWith(ApplicationExtension::class)
class ProfileCredentialsIdentifierSsoTest {
    private val sut = ProfileCredentialsIdentifierSso("", "", "", null)

    @JvmField
    @RegisterExtension
    val mockClientManager = MockClientManagerExtension()

    @Test
    fun `handles SsoOidcException`() {
        val exception = SsoOidcException.builder().message("message").build()

        assertThat(sut.handleValidationException(exception)).isNotNull()
    }

    @Test
    fun `handles nested SsoOidcException`() {
        val root = SsoOidcException.builder().message("message").build()
        // Exception(Exception(Exception(...)))
        val exception = (1..1000).fold(root as Exception) { acc, _ -> Exception(acc) }

        assertThat(sut.handleValidationException(exception)).isNotNull()
    }

    @Test
    fun `handles exception from uninitialized token provider`() {
        val cache = mock<DiskCache>()
        mockClientManager.create<SsoOidcClient>()

        // IllegalStateException instead of more general base Exception so we know if the type changes
        val exception = assertThrows<NoTokenInitializedException> {
            InteractiveBearerTokenProvider("", "us-east-1", emptyList(), cache = cache, id = "test").resolveToken()
        }
        assertThat(sut.handleValidationException(exception)).isNotNull()
    }

    @Test
    fun `ignores arbitrary exception`() {
        assertThat(sut.handleValidationException(RuntimeException())).isNull()
    }
}
