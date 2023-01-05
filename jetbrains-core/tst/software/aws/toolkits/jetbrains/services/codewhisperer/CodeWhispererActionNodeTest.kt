// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.project.Project
import com.intellij.testFramework.ApplicationRule
import com.intellij.testFramework.DisposableRule
import com.intellij.testFramework.ProjectRule
import com.intellij.testFramework.replaceService
import com.intellij.testFramework.runInEdtAndWait
import org.assertj.core.api.Assertions.assertThat
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.mockito.Mockito.mockConstruction
import org.mockito.kotlin.any
import org.mockito.kotlin.eq
import org.mockito.kotlin.isA
import org.mockito.kotlin.mock
import org.mockito.kotlin.spy
import org.mockito.kotlin.times
import org.mockito.kotlin.verify
import org.mockito.kotlin.whenever
import software.aws.toolkits.jetbrains.core.credentials.AwsBearerTokenConnection
import software.aws.toolkits.jetbrains.core.credentials.ToolkitConnectionManager
import software.aws.toolkits.jetbrains.core.credentials.pinning.CodeWhispererConnection
import software.aws.toolkits.jetbrains.services.codewhisperer.codescan.CodeWhispererCodeScanManager
import software.aws.toolkits.jetbrains.services.codewhisperer.credentials.CodeWhispererLoginDialog
import software.aws.toolkits.jetbrains.services.codewhisperer.explorer.CodeWhispererExploreActionState
import software.aws.toolkits.jetbrains.services.codewhisperer.explorer.CodeWhispererExploreStateType
import software.aws.toolkits.jetbrains.services.codewhisperer.explorer.CodeWhispererExplorerActionManager
import software.aws.toolkits.jetbrains.services.codewhisperer.explorer.CodeWhispererTermsOfServiceDialog
import software.aws.toolkits.jetbrains.services.codewhisperer.explorer.isCodeWhispererEnabled
import software.aws.toolkits.jetbrains.services.codewhisperer.explorer.nodes.CodeWhispererActionNode
import software.aws.toolkits.jetbrains.services.codewhisperer.explorer.nodes.GetStartedNode
import software.aws.toolkits.jetbrains.services.codewhisperer.explorer.nodes.OpenCodeReferenceNode
import software.aws.toolkits.jetbrains.services.codewhisperer.explorer.nodes.RunCodeScanNode
import software.aws.toolkits.jetbrains.services.codewhisperer.toolwindow.CodeWhispererCodeReferenceManager

class CodeWhispererActionNodeTest {
    @JvmField
    @Rule
    val applicationRule = ApplicationRule()

    @JvmField
    @Rule
    val projectRule = ProjectRule()

    @JvmField
    @Rule
    val disposableRule = DisposableRule()

    private lateinit var project: Project
    private lateinit var sut: CodeWhispererActionNode
    private lateinit var explorerManager: CodeWhispererExplorerActionManager
    private lateinit var connectionManager: ToolkitConnectionManager
    private lateinit var codeScanManager: CodeWhispererCodeScanManager

    @Before
    fun setup() {
        project = projectRule.project

        explorerManager = spy()
        ApplicationManager.getApplication().replaceService(CodeWhispererExplorerActionManager::class.java, explorerManager, disposableRule.disposable)

        connectionManager = mock()
        project.replaceService(ToolkitConnectionManager::class.java, connectionManager, disposableRule.disposable)

        codeScanManager = mock()
        project.replaceService(CodeWhispererCodeScanManager::class.java, codeScanManager, disposableRule.disposable)
    }

    @Test
    fun `openCodeReferenceNode`() {
        sut = OpenCodeReferenceNode(project)
        val referenceManager: CodeWhispererCodeReferenceManager = mock()
        project.replaceService(CodeWhispererCodeReferenceManager::class.java, referenceManager, disposableRule.disposable)

        sut.onDoubleClick(mock())

        verify(referenceManager).showCodeReferencePanel()
    }

    @Test
    fun `runCodeScanNode`() {
        whenever(codeScanManager.getActionButtonIcon()).thenReturn(mock())

        sut = RunCodeScanNode(project)

        sut.onDoubleClick(mock())

        verify(codeScanManager).runCodeScan()
    }

    @Test
    fun `getStartedNode - if there is active connection(nonnull), will not show tos if already accepted`() {
        sut = GetStartedNode(project)

        whenever(connectionManager.activeConnectionForFeature(isA<CodeWhispererConnection>())).thenReturn(mock<AwsBearerTokenConnection>())
        explorerManager.loadState(
            CodeWhispererExploreActionState().apply {
                this.value[CodeWhispererExploreStateType.HasAcceptedTermsOfServices] = true
            }
        )

        runInEdtAndWait {
            mockConstruction(CodeWhispererTermsOfServiceDialog::class.java) { tosMock, _ ->
                whenever(tosMock.showAndGet()).thenReturn(true)
            }.use {
                sut.onDoubleClick(mock())
                assertThat(it.constructed().size).isEqualTo(0)
                verify(explorerManager, times(0)).setHasAcceptedTermsOfService(any())
            }
        }
    }

    @Test
    fun `getStartedNode - if there is active connection(nonnull), will show CW tos if not yet accepted`() {
        sut = GetStartedNode(project)

        whenever(connectionManager.activeConnectionForFeature(isA<CodeWhispererConnection>())).thenReturn(mock<AwsBearerTokenConnection>())
        explorerManager.loadState(
            CodeWhispererExploreActionState().apply {
                this.value[CodeWhispererExploreStateType.HasAcceptedTermsOfServices] = false
            }
        )

        runInEdtAndWait {
            mockConstruction(CodeWhispererTermsOfServiceDialog::class.java) { tosMock, _ ->
                whenever(tosMock.showAndGet()).thenReturn(true)
            }.use {
                assertThat(isCodeWhispererEnabled(project)).isFalse

                sut.onDoubleClick(mock())
                assertThat(it.constructed().size).isEqualTo(1)
                verify(explorerManager).setHasAcceptedTermsOfService(eq(true))

                assertThat(isCodeWhispererEnabled(project)).isTrue
            }
        }
    }

    @Test
    fun `getStartedNode - if there is no active connection(nonnull), should pop login dialog and CW tos if login succeed`() {
        sut = GetStartedNode(project)

        whenever(connectionManager.activeConnectionForFeature(isA<CodeWhispererConnection>())).thenReturn(null)
        explorerManager.loadState(
            CodeWhispererExploreActionState().apply {
                this.value[CodeWhispererExploreStateType.HasAcceptedTermsOfServices] = false
            }
        )

        runInEdtAndWait {
            mockConstruction(CodeWhispererTermsOfServiceDialog::class.java) { tosMock, _ ->
                whenever(tosMock.showAndGet()).thenReturn(true)
            }.use { tosConstruction ->
                mockConstruction(CodeWhispererLoginDialog::class.java) { loginDialogMock, _ ->
                    whenever(loginDialogMock.showAndGet()).thenAnswer {
                        // simulate login succeed
                        whenever(connectionManager.activeConnectionForFeature(isA<CodeWhispererConnection>())).thenReturn(mock<AwsBearerTokenConnection>())
                        true
                    }
                }.use { loginDialogConstruction ->
                    assertThat(isCodeWhispererEnabled(project)).isFalse

                    sut.onDoubleClick(mock())
                    assertThat(tosConstruction.constructed().size).isEqualTo(1)
                    assertThat(loginDialogConstruction.constructed().size).isEqualTo(1)
                    verify(explorerManager).setHasAcceptedTermsOfService(eq(true))

                    assertThat(isCodeWhispererEnabled(project)).isTrue
                }
            }
        }
    }
}
