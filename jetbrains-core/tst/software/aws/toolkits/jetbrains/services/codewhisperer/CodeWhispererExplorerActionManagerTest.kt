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

    private lateinit var sut: CodeWhispererExplorerActionManager
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
    fun `when hasAcceptedTermsOfService is false should return logout`() {
        sut = spy()
        whenever(sut.hasAcceptedTermsOfService()).thenReturn(false)

        val actual = sut.checkActiveCodeWhispererConnectionType(project)
        assertThat(actual).isEqualTo(CodeWhispererLoginType.Logout)
    }

    @Test
    fun `when there is no connection, should return logout`() {
        sut = spy()
        whenever(sut.hasAcceptedTermsOfService()).thenReturn(true)
        whenever(connectionManager.activeConnectionForFeature(any())).thenReturn(null)

        val actual = sut.checkActiveCodeWhispererConnectionType(project)
        assertThat(actual).isEqualTo(CodeWhispererLoginType.Logout)
    }

    @Test
    fun `when ToS accepted and there is an accountless token, should return accountless`() {
        sut = spy()
        whenever(sut.hasAcceptedTermsOfService()).thenReturn(true)

        sut.loadState(
            // set up accountless token
            CodeWhispererExploreActionState().apply {
                this.token = "foo"
            }
        )

        val actual = sut.checkActiveCodeWhispererConnectionType(project)
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
        sut = CodeWhispererExplorerActionManager()
        sut.loadState(CodeWhispererExploreActionState().apply { this.token = "foo" })

        assertThat(sut.state.token)
            .isNotNull
            .isEqualTo("foo")

        sut.nullifyAccountlessCredentialIfNeeded()

        assertThat(sut.state.token)
            .isNull()
    }

    /**
     * isCodeWhispererEnabled
     * - should return false if loginType == Logout
     * - should return true if loginType == Accountless || Sono || SSO
     */
    @Test
    fun `test isCodeWhispererEnabled`() {
        sut = spy()
        ApplicationManager.getApplication().replaceService(CodeWhispererExplorerActionManager::class.java, sut, disposableRule.disposable)

        whenever(sut.checkActiveCodeWhispererConnectionType(project)).thenReturn(CodeWhispererLoginType.Logout)
        assertThat(isCodeWhispererEnabled(project)).isFalse

        whenever(sut.checkActiveCodeWhispererConnectionType(project)).thenReturn(CodeWhispererLoginType.Accountless)
        assertThat(isCodeWhispererEnabled(project)).isTrue

        whenever(sut.checkActiveCodeWhispererConnectionType(project)).thenReturn(CodeWhispererLoginType.Sono)
        assertThat(isCodeWhispererEnabled(project)).isTrue

        whenever(sut.checkActiveCodeWhispererConnectionType(project)).thenReturn(CodeWhispererLoginType.SSO)
        assertThat(isCodeWhispererEnabled(project)).isTrue
    }

    private fun assertLoginType(startUrl: String, expectedType: CodeWhispererLoginType) {
        sut = spy()
        whenever(sut.hasAcceptedTermsOfService()).thenReturn(true)
        whenever(connectionManager.activeConnectionForFeature(any())).thenReturn(
            ManagedBearerSsoConnection(
                startUrl = startUrl,
                region = "us-east-1",
                emptyList()
            )
        )

        val actual = sut.checkActiveCodeWhispererConnectionType(project)
        assertThat(actual).isEqualTo(expectedType)
    }
}
