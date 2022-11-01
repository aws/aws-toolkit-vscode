// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials.sso.bearer

import com.intellij.testFramework.ApplicationRule
import com.intellij.testFramework.RuleChain
import org.assertj.core.api.Assertions.assertThat
import org.junit.Before
import org.junit.BeforeClass
import org.junit.ClassRule
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import org.mockito.kotlin.verifyNoInteractions
import software.amazon.awssdk.services.ssooidc.SsoOidcClient
import software.aws.toolkits.core.region.aRegionId
import software.aws.toolkits.core.rules.EnvironmentVariableHelper
import software.aws.toolkits.core.utils.toHexString
import software.aws.toolkits.core.utils.touch
import software.aws.toolkits.core.utils.writeText
import software.aws.toolkits.jetbrains.core.MockClientManagerRule
import java.nio.file.Path
import java.security.MessageDigest
import java.time.Instant
import java.time.format.DateTimeFormatter

class ProfileSdkTokenProviderWrapperTest {
    val applicationRule = ApplicationRule()
    val mockClientManager = MockClientManagerRule()

    @Rule
    @JvmField
    val ruleChain = RuleChain(
        applicationRule,
        mockClientManager
    )

    private lateinit var sut: ProfileSdkTokenProviderWrapper
    private lateinit var oidcClient: SsoOidcClient

    companion object {
        lateinit var testHomeDir: Path

        @ClassRule
        @JvmField
        val envVarManager = EnvironmentVariableHelper()

        @ClassRule
        @JvmField
        val tempDirRule = TemporaryFolder()

        @BeforeClass
        @JvmStatic
        fun beforeClass() {
            testHomeDir = tempDirRule.newFolder().toPath().toAbsolutePath()
            envVarManager.set("HOME", testHomeDir.toString())
            envVarManager.set("USERPROFILE", testHomeDir.toString())
        }
    }

    @Before
    fun setUp() {
        oidcClient = mockClientManager.create<SsoOidcClient>()
        sut = ProfileSdkTokenProviderWrapper(aRegionId(), "mock")
    }

    @Test
    fun `currentToken retrieves from expected location`() {
        writeToken(expiry = Instant.now().plusSeconds(9000))

        assertThat(sut.currentToken()).isNotNull()
    }

    @Test
    fun `retrieving nonexistent current token doesn't make SDK calls`() {
        assertThat(sut.currentToken()).isNull()
        verifyNoInteractions(oidcClient)
    }

    @Test
    fun `retrieving expired current token doesn't make SDK calls`() {
        writeToken(Instant.now().minusSeconds(9000))

        assertThat(sut.currentToken()).isNull()
        verifyNoInteractions(oidcClient)
    }

    private fun writeToken(expiry: Instant = Instant.now()) {
        val tokenPath = testHomeDir
            .resolve(Path.of(".aws", "sso", "cache"))
            .resolve(MessageDigest.getInstance("SHA-1").digest("mock".toByteArray()).toHexString() + ".json")
        tokenPath.touch()
        tokenPath.writeText(
            // doesn't match what SDK actually uses, but we only care about a subset of fields at the moment
            // language=JSON
            """
            {
              "accessToken": "anAccessToken",
              "expiresAt": "${DateTimeFormatter.ISO_INSTANT.format(expiry)}",
              "refreshToken": "aRefreshToken",
              "region": "aRegion",
              "startUrl": "aStartUrl"
            }
            """.trimIndent()
        )
    }
}
