// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials

import com.intellij.openapi.actionSystem.ActionManager
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.application.ApplicationManager
import com.intellij.testFramework.ApplicationRule
import com.intellij.testFramework.DisposableRule
import com.intellij.testFramework.ProjectRule
import com.intellij.testFramework.replaceService
import org.assertj.core.api.Assertions.assertThat
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.mockito.Mockito.verify
import org.mockito.kotlin.doReturn
import org.mockito.kotlin.eq
import org.mockito.kotlin.mock
import org.mockito.kotlin.verifyNoInteractions
import org.mockito.kotlin.verifyNoMoreInteractions
import org.mockito.kotlin.whenever
import software.aws.toolkits.jetbrains.core.credentials.sso.bearer.BearerTokenProviderListener

class SsoSignoutActionTest {
    @JvmField
    @Rule
    val applicationRule = ApplicationRule()

    @JvmField
    @Rule
    val projectRule = ProjectRule()

    @JvmField
    @Rule
    val disposableRule = DisposableRule()

    lateinit var sut: AnAction
    lateinit var connectionManager: ToolkitConnectionManager
    lateinit var authManager: ToolkitAuthManager

    private val deletedCredentialProviders = mutableListOf<String>()

    @Before
    fun setup() {
        connectionManager = mock()
        authManager = mock()

        projectRule.project.replaceService(ToolkitConnectionManager::class.java, connectionManager, disposableRule.disposable)
        ApplicationManager.getApplication().replaceService(ToolkitAuthManager::class.java, authManager, disposableRule.disposable)

        sut = ActionManager.getInstance().getAction("aws.toolkit.toolwindow.sso.signout")

        ApplicationManager.getApplication().messageBus.connect().subscribe(
            BearerTokenProviderListener.TOPIC,
            object : BearerTokenProviderListener {
                override fun invalidate(providerId: String) {
                    deletedCredentialProviders.add(providerId)
                }
            }
        )

        deletedCredentialProviders.clear()
    }

    @Test
    fun `when there is no active connection, logout does nothing`() {
        val context = mock<AnActionEvent>()
        whenever(context.project).thenReturn(projectRule.project)
        whenever(connectionManager.activeConnection()).thenReturn(null)

        sut.actionPerformed(context)

        verify(connectionManager).activeConnection()
        verifyNoMoreInteractions(connectionManager)
        verifyNoInteractions(authManager)
        assertThat(deletedCredentialProviders).hasSize(0)
    }

    @Test
    fun `when there is an active Bearer connection, signout should delete the connection and switchConnection to null`() {
        val context = mock<AnActionEvent>()
        whenever(context.project).thenReturn(projectRule.project)

        val activeConnection = mock<AwsBearerTokenConnection> { on { id } doReturn "fooConnection" }
        whenever(connectionManager.activeConnection()).thenReturn(activeConnection)

        sut.actionPerformed(context)

        verify(connectionManager).activeConnection()
        verify(connectionManager).switchConnection(eq(null))
        verify(authManager).deleteConnection(eq("fooConnection"))
        assertThat(deletedCredentialProviders).hasSize(1)
        assertThat(deletedCredentialProviders[0]).isEqualTo("fooConnection")
    }

    @Test
    fun `when there is an active IAM connection, signout should do nothing`() {
        val context = mock<AnActionEvent>()
        whenever(context.project).thenReturn(projectRule.project)

        val activeConnection = mock<AwsCredentialConnection> { on { id } doReturn "fooConnection" }
        whenever(connectionManager.activeConnection()).thenReturn(activeConnection)

        sut.actionPerformed(context)

        verify(connectionManager).activeConnection()
        verifyNoMoreInteractions(connectionManager)
        verifyNoInteractions(authManager)
        assertThat(deletedCredentialProviders).hasSize(0)
    }
}
