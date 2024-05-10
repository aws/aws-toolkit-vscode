// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials.sso.bearer

import com.intellij.openapi.util.Disposer
import com.intellij.testFramework.ApplicationExtension
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assumptions.assumeThat
import org.junit.jupiter.api.MethodOrderer
import org.junit.jupiter.api.Order
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.TestMethodOrder
import org.junit.jupiter.api.condition.DisabledIfEnvironmentVariable
import org.junit.jupiter.api.extension.ExtendWith
import org.junit.jupiter.api.io.TempDir
import software.aws.toolkits.jetbrains.core.credentials.sono.SONO_REGION
import software.aws.toolkits.jetbrains.core.credentials.sono.SONO_URL
import software.aws.toolkits.jetbrains.core.credentials.sso.DeviceAuthorizationGrantToken
import software.aws.toolkits.jetbrains.core.credentials.sso.DeviceGrantAccessTokenCacheKey
import software.aws.toolkits.jetbrains.core.credentials.sso.DiskCache
import software.aws.toolkits.jetbrains.utils.extensions.SsoLogin
import software.aws.toolkits.jetbrains.utils.extensions.SsoLoginExtension
import java.nio.file.Path
import java.time.Instant

@TestMethodOrder(MethodOrderer.OrderAnnotation::class)
@ExtendWith(ApplicationExtension::class, SsoLoginExtension::class)
@SsoLogin("codecatalyst-test-account")
@DisabledIfEnvironmentVariable(named = "IS_PROD", matches = "false")
class InteractiveBearerTokenProviderIntegrationTest {
    companion object {
        @JvmStatic
        @TempDir
        private lateinit var diskCachePath: Path

        private val testScopes = listOf("sso:account:access")
        private val diskCache by lazy { DiskCache(cacheDir = diskCachePath) }
        private val cacheKey = DeviceGrantAccessTokenCacheKey(SONO_REGION, SONO_URL, testScopes)
    }

    @Test
    @Order(1)
    fun `test Builder ID login`() {
        val initialToken = diskCache.loadAccessToken(cacheKey)
        assertThat(initialToken).isNull()

        val sut = InteractiveBearerTokenProvider(
            startUrl = SONO_URL,
            region = SONO_REGION,
            scopes = testScopes,
            cache = diskCache,
            id = "test"
        )

        sut.reauthenticate()
        assertThat(sut.resolveToken()).isNotNull()

        Disposer.dispose(sut)
    }

    @Test
    @Order(2)
    fun `test token refresh`() {
        val initialToken = diskCache.loadAccessToken(cacheKey)
        assumeThat(initialToken).isNotNull

        diskCache.saveAccessToken(cacheKey, (initialToken!! as DeviceAuthorizationGrantToken).copy(accessToken = "invalid", expiresAt = Instant.EPOCH))
        val sut = InteractiveBearerTokenProvider(
            startUrl = SONO_URL,
            region = SONO_REGION,
            scopes = testScopes,
            cache = diskCache,
            id = "test"
        )

        assertThat(sut.resolveToken()).satisfies {
            assertThat(it).isNotNull()
            assertThat(it).isNotEqualTo(initialToken)
        }

        Disposer.dispose(sut)
    }
}
