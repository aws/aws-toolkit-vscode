// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer

import com.intellij.openapi.project.Project
import com.intellij.testFramework.DisposableRule
import com.intellij.testFramework.ProjectRule
import com.intellij.testFramework.replaceService
import org.assertj.core.api.Assertions.assertThat
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import org.mockito.kotlin.any
import org.mockito.kotlin.mock
import org.mockito.kotlin.spy
import org.mockito.kotlin.whenever
import software.amazon.awssdk.services.ssooidc.SsoOidcClient
import software.aws.toolkits.core.utils.test.aString
import software.aws.toolkits.jetbrains.core.MockClientManagerRule
import software.aws.toolkits.jetbrains.core.credentials.LegacyManagedBearerSsoConnection
import software.aws.toolkits.jetbrains.core.credentials.MockToolkitAuthManagerRule
import software.aws.toolkits.jetbrains.core.credentials.ToolkitConnectionManager
import software.aws.toolkits.jetbrains.core.credentials.pinning.CodeWhispererConnection
import software.aws.toolkits.jetbrains.core.credentials.pinning.ConnectionPinningManager
import software.aws.toolkits.jetbrains.core.credentials.sono.Q_SCOPES
import software.aws.toolkits.jetbrains.core.credentials.sono.SONO_URL
import software.aws.toolkits.jetbrains.core.credentials.sso.DeviceAuthorizationGrantToken
import software.aws.toolkits.jetbrains.core.credentials.sso.DeviceGrantAccessTokenCacheKey
import software.aws.toolkits.jetbrains.core.credentials.sso.DiskCache
import software.aws.toolkits.jetbrains.core.credentials.sso.bearer.BearerTokenAuthState
import software.aws.toolkits.jetbrains.core.credentials.sso.bearer.InteractiveBearerTokenProvider
import software.aws.toolkits.jetbrains.services.codewhisperer.credentials.CodeWhispererLoginType
import software.aws.toolkits.jetbrains.services.codewhisperer.explorer.CodeWhispererExplorerActionManager
import software.aws.toolkits.jetbrains.services.codewhisperer.explorer.isCodeWhispererEnabled
import software.aws.toolkits.jetbrains.services.codewhisperer.explorer.isCodeWhispererExpired
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.Paths
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset
import java.time.temporal.ChronoUnit

class CodeWhispererExplorerActionManagerTest {
    @JvmField
    @Rule
    val tempFolder = TemporaryFolder()

    @JvmField
    @Rule
    val projectRule = ProjectRule()

    @JvmField
    @Rule
    val disposableRule = DisposableRule()

    @JvmField
    @Rule
    val authManager = MockToolkitAuthManagerRule()

    @JvmField
    @Rule
    val mockClientManager = MockClientManagerRule()

    private val now = Instant.now()
    private val clock = Clock.fixed(now, ZoneOffset.UTC)

    private lateinit var mockManager: CodeWhispererExplorerActionManager
    private lateinit var project: Project
    private lateinit var cacheRoot: Path
    private lateinit var cacheLocation: Path
    private lateinit var testDiskCache: DiskCache

    @Before
    fun setup() {
        cacheRoot = tempFolder.root.toPath().toAbsolutePath()
        cacheLocation = Paths.get(cacheRoot.toString(), "fakehome", ".aws", "sso", "cache")
        Files.createDirectories(cacheLocation)
        testDiskCache = DiskCache(cacheLocation, clock)

        mockClientManager.create<SsoOidcClient>()
        project = projectRule.project
    }

    /**
     * CheckActiveCodeWhispererConnectionType()
     */
    @Test
    fun `when there is no connection, should return logout`() {
        mockManager = spy()
        val mockConnectionManager = mock<ToolkitConnectionManager>()
        whenever(mockConnectionManager.activeConnectionForFeature(any())).thenReturn(null)
        project.replaceService(ToolkitConnectionManager::class.java, mockConnectionManager, disposableRule.disposable)

        val actual = mockManager.checkActiveCodeWhispererConnectionType(project)
        assertThat(actual).isEqualTo(CodeWhispererLoginType.Logout)
        assertThat(isCodeWhispererEnabled(project)).isFalse
        assertThat(isCodeWhispererExpired(project)).isFalse
    }

    /**
     * isCodeWhispererEnabled
     * - should return false if loginType == Logout
     * - should return true if loginType == Accountless || Sono || SSO
     */
    @Test
    fun `test connection state`() {
        assertConnectionState(
            startUrl = SONO_URL,
            refreshToken = aString(),
            expirationTime = now.plus(1, ChronoUnit.DAYS),
            expectedState = BearerTokenAuthState.AUTHORIZED,
            expectedLoginType = CodeWhispererLoginType.Sono,
            expectedIsCwEnabled = true,
            expectedIsCwExpired = false
        )
        assertThat(ConnectionPinningManager.getInstance().isFeaturePinned(CodeWhispererConnection.getInstance())).isFalse

        assertConnectionState(
            startUrl = SONO_URL,
            refreshToken = aString(),
            expirationTime = now.minus(1, ChronoUnit.DAYS),
            expectedState = BearerTokenAuthState.NEEDS_REFRESH,
            expectedLoginType = CodeWhispererLoginType.Expired,
            expectedIsCwEnabled = true,
            expectedIsCwExpired = true
        )
        assertThat(ConnectionPinningManager.getInstance().isFeaturePinned(CodeWhispererConnection.getInstance())).isFalse

        assertConnectionState(
            startUrl = SONO_URL,
            refreshToken = null,
            expirationTime = now.minus(1, ChronoUnit.DAYS),
            expectedState = BearerTokenAuthState.NOT_AUTHENTICATED,
            expectedLoginType = CodeWhispererLoginType.Logout,
            expectedIsCwEnabled = false,
            expectedIsCwExpired = false
        )
        assertThat(ConnectionPinningManager.getInstance().isFeaturePinned(CodeWhispererConnection.getInstance())).isFalse

        assertConnectionState(
            startUrl = aString(),
            refreshToken = aString(),
            expirationTime = now.plus(1, ChronoUnit.DAYS),
            expectedState = BearerTokenAuthState.AUTHORIZED,
            expectedLoginType = CodeWhispererLoginType.SSO,
            expectedIsCwEnabled = true,
            expectedIsCwExpired = false
        )
        assertThat(ConnectionPinningManager.getInstance().isFeaturePinned(CodeWhispererConnection.getInstance())).isFalse

        assertConnectionState(
            startUrl = aString(),
            refreshToken = aString(),
            expirationTime = now.minus(1, ChronoUnit.DAYS),
            expectedState = BearerTokenAuthState.NEEDS_REFRESH,
            expectedLoginType = CodeWhispererLoginType.Expired,
            expectedIsCwEnabled = true,
            expectedIsCwExpired = true
        )
        assertThat(ConnectionPinningManager.getInstance().isFeaturePinned(CodeWhispererConnection.getInstance())).isFalse

        assertConnectionState(
            startUrl = aString(),
            refreshToken = null,
            expirationTime = now.minus(1, ChronoUnit.DAYS),
            expectedState = BearerTokenAuthState.NOT_AUTHENTICATED,
            expectedLoginType = CodeWhispererLoginType.Logout,
            expectedIsCwEnabled = false,
            expectedIsCwExpired = false
        )
        assertThat(ConnectionPinningManager.getInstance().isFeaturePinned(CodeWhispererConnection.getInstance())).isFalse
    }

    private fun assertConnectionState(
        startUrl: String,
        refreshToken: String?,
        expirationTime: Instant,
        expectedState: BearerTokenAuthState,
        expectedLoginType: CodeWhispererLoginType,
        expectedIsCwEnabled: Boolean,
        expectedIsCwExpired: Boolean
    ) {
        testDiskCache.saveAccessToken(
            DeviceGrantAccessTokenCacheKey(
                connectionId = "us-east-1",
                startUrl = startUrl,
                scopes = Q_SCOPES
            ),
            DeviceAuthorizationGrantToken(
                startUrl = startUrl,
                region = "us-east-1",
                accessToken = aString(),
                refreshToken = refreshToken,
                expiresAt = expirationTime
            )
        )

        val myConnection = LegacyManagedBearerSsoConnection(
            startUrl,
            "us-east-1",
            Q_SCOPES,
            testDiskCache
        )

        ToolkitConnectionManager.getInstance(project).switchConnection(myConnection)
        val activeCwConn = ToolkitConnectionManager.getInstance(project).activeConnectionForFeature(CodeWhispererConnection.getInstance())
        val myTokenProvider = myConnection.getConnectionSettings().tokenProvider.delegate as InteractiveBearerTokenProvider

        assertThat(activeCwConn).isEqualTo(myConnection)
        assertThat(myTokenProvider.state()).isEqualTo(expectedState)
        assertThat(CodeWhispererExplorerActionManager.getInstance().checkActiveCodeWhispererConnectionType(project)).isEqualTo(expectedLoginType)
        assertThat(isCodeWhispererEnabled(project)).isEqualTo(expectedIsCwEnabled)
        assertThat(isCodeWhispererExpired(project)).isEqualTo(expectedIsCwExpired)
    }
}
