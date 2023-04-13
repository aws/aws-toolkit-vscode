// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.project.Project
import com.intellij.testFramework.ApplicationRule
import com.intellij.testFramework.DisposableRule
import com.intellij.testFramework.ProjectRule
import com.intellij.testFramework.replaceService
import org.assertj.core.api.Assertions.assertThat
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.mockito.kotlin.any
import org.mockito.kotlin.mock
import org.mockito.kotlin.spy
import org.mockito.kotlin.whenever
import software.amazon.awssdk.services.ssooidc.SsoOidcClient
import software.aws.toolkits.core.utils.test.aString
import software.aws.toolkits.jetbrains.core.MockClientManagerRule
import software.aws.toolkits.jetbrains.core.credentials.ManagedBearerSsoConnection
import software.aws.toolkits.jetbrains.core.credentials.MockToolkitAuthManagerRule
import software.aws.toolkits.jetbrains.core.credentials.ToolkitConnectionManager
import software.aws.toolkits.jetbrains.core.credentials.sono.SONO_URL
import software.aws.toolkits.jetbrains.services.codewhisperer.credentials.CodeWhispererLoginType
import software.aws.toolkits.jetbrains.services.codewhisperer.explorer.CodeWhispererExploreActionState
import software.aws.toolkits.jetbrains.services.codewhisperer.explorer.CodeWhispererExplorerActionManager
import software.aws.toolkits.jetbrains.services.codewhisperer.explorer.isCodeWhispererEnabled

class CodeWhispererExplorerActionManagerTest {
    @JvmField
    @Rule
    val applicationRule = ApplicationRule()

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

    private lateinit var mockManager: CodeWhispererExplorerActionManager
    private lateinit var project: Project
    private lateinit var connectionManager: ToolkitConnectionManager

    @Before
    fun setup() {
        mockClientManager.create<SsoOidcClient>()
        project = projectRule.project
        connectionManager = mock()

        project.replaceService(ToolkitConnectionManager::class.java, connectionManager, disposableRule.disposable)
    }

    /**
     * CheckActiveCodeWhispererConnectionType()
     */
    @Test
    fun `when there is no connection, should return logout`() {
        mockManager = spy()
        whenever(connectionManager.activeConnectionForFeature(any())).thenReturn(null)

        val actual = mockManager.checkActiveCodeWhispererConnectionType(project)
        assertThat(actual).isEqualTo(CodeWhispererLoginType.Logout)
    }

    @Test
    fun `when ToS accepted and there is an accountless token, should return accountless`() {
        mockManager = spy()
        mockManager.loadState(
            // set up accountless token
            CodeWhispererExploreActionState().apply {
                this.token = "foo"
            }
        )

        val actual = mockManager.checkActiveCodeWhispererConnectionType(project)
        assertThat(actual).isEqualTo(CodeWhispererLoginType.Accountless)
    }

    @Test
    fun `when ToS accepted, no accountless token and there is an AWS Builder ID connection, should return Sono`() {
        assertLoginType(SONO_URL, CodeWhispererLoginType.Sono)
    }

    @Test
    fun `when ToS accepted, no accountless token and there is an SSO connection, should return SSO`() {
        assertLoginType(aString(), CodeWhispererLoginType.SSO)
    }

    @Test
    fun `test nullifyAccountlessCredentialIfNeeded`() {
        mockManager = CodeWhispererExplorerActionManager()
        mockManager.loadState(CodeWhispererExploreActionState().apply { this.token = "foo" })

        assertThat(mockManager.state.token)
            .isNotNull
            .isEqualTo("foo")

        mockManager.nullifyAccountlessCredentialIfNeeded()

        assertThat(mockManager.state.token)
            .isNull()
    }

    /**
     * isCodeWhispererEnabled
     * - should return false if loginType == Logout
     * - should return true if loginType == Accountless || Sono || SSO
     */
    @Test
    fun `test isCodeWhispererEnabled`() {
        mockManager = mock()
        ApplicationManager.getApplication().replaceService(CodeWhispererExplorerActionManager::class.java, mockManager, disposableRule.disposable)

        whenever(mockManager.checkActiveCodeWhispererConnectionType(project)).thenReturn(CodeWhispererLoginType.Logout)
        assertThat(isCodeWhispererEnabled(project)).isFalse

        whenever(mockManager.checkActiveCodeWhispererConnectionType(project)).thenReturn(CodeWhispererLoginType.Accountless)
        assertThat(isCodeWhispererEnabled(project)).isTrue

        whenever(mockManager.checkActiveCodeWhispererConnectionType(project)).thenReturn(CodeWhispererLoginType.Sono)
        assertThat(isCodeWhispererEnabled(project)).isTrue

        whenever(mockManager.checkActiveCodeWhispererConnectionType(project)).thenReturn(CodeWhispererLoginType.SSO)
        assertThat(isCodeWhispererEnabled(project)).isTrue
    }

    private fun assertLoginType(startUrl: String, expectedType: CodeWhispererLoginType) {
        mockManager = spy()
        val conn: ManagedBearerSsoConnection = mock()
        whenever(connectionManager.activeConnectionForFeature(any())).thenReturn(conn)
        whenever(conn.startUrl).thenReturn(startUrl)
        whenever(conn.getConnectionSettings()).thenReturn(null)

        val actual = mockManager.checkActiveCodeWhispererConnectionType(project)
        assertThat(actual).isEqualTo(expectedType)
    }
}
