// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer

import com.intellij.openapi.application.ApplicationManager
import com.intellij.testFramework.DisposableRule
import com.intellij.testFramework.replaceService
import com.intellij.testFramework.runInEdtAndWait
import kotlinx.coroutines.TimeoutCancellationException
import org.assertj.core.api.Assertions.assertThat
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.mockito.kotlin.any
import org.mockito.kotlin.doReturn
import org.mockito.kotlin.doThrow
import org.mockito.kotlin.mock
import org.mockito.kotlin.whenever
import software.aws.toolkits.jetbrains.services.codewhisperer.model.LatencyContext
import software.aws.toolkits.jetbrains.services.codewhisperer.model.TriggerTypeInfo
import software.aws.toolkits.jetbrains.services.codewhisperer.service.CodeWhispererAutomatedTriggerType
import software.aws.toolkits.jetbrains.services.codewhisperer.service.CodeWhispererService
import software.aws.toolkits.jetbrains.services.codewhisperer.service.CodeWhispererUserGroup
import software.aws.toolkits.jetbrains.services.codewhisperer.service.CodeWhispererUserGroupSettings
import software.aws.toolkits.jetbrains.services.codewhisperer.util.CodeWhispererConstants
import software.aws.toolkits.jetbrains.services.codewhisperer.util.FileContextProvider
import software.aws.toolkits.jetbrains.utils.rules.JavaCodeInsightTestFixtureRule
import software.aws.toolkits.telemetry.CodewhispererTriggerType

class CodeWhispererServiceTest {
    @Rule
    @JvmField
    val projectRule = JavaCodeInsightTestFixtureRule()

    @Rule
    @JvmField
    val disposableRule = DisposableRule()

    private lateinit var sut: CodeWhispererService
    private lateinit var userGroupSetting: CodeWhispererUserGroupSettings

    @Before
    fun setUp() {
        sut = CodeWhispererService.getInstance()
        userGroupSetting = mock()

        ApplicationManager.getApplication().replaceService(CodeWhispererUserGroupSettings::class.java, userGroupSetting, disposableRule.disposable)
    }

    @Test
    fun `getRequestContext - cross file context should be non-null for cross-file user group`() {
        whenever(userGroupSetting.getUserGroup()).thenReturn(CodeWhispererUserGroup.CrossFile)
        val mockFileContextProvider = mock<FileContextProvider> {
            on { this.extractFileContext(any(), any()) } doReturn aFileContextInfo()
            onBlocking { this.extractSupplementalFileContext(any(), any()) } doThrow TimeoutCancellationException::class
        }
        projectRule.project.replaceService(FileContextProvider::class.java, mockFileContextProvider, disposableRule.disposable)
        val file = projectRule.fixture.addFileToProject("main.java", "public class Main {}")
        runInEdtAndWait {
            projectRule.fixture.openFileInEditor(file.virtualFile)
        }

        val actual = sut.getRequestContext(
            TriggerTypeInfo(CodewhispererTriggerType.OnDemand, CodeWhispererAutomatedTriggerType.Unknown()),
            projectRule.fixture.editor,
            projectRule.project,
            file,
            LatencyContext()
        )

        actual.supplementalContext.let {
            assertThat(it).isNotNull
            assertThat(it?.isProcessTimeout)
                .isNotNull
                .isEqualTo(
                    it?.latency?.let { latency ->
                        latency > CodeWhispererConstants.SUPPLEMENTAL_CONTEXT_TIMEOUT
                    }
                )

            assertThat(it?.contents).isNotNull.isEmpty()
        }

        assertThat(actual.supplementalContext).isNotNull
    }

    @Test
    fun `getRequestContext - cross file context should be null for non-cross-file user group`() {
        whenever(userGroupSetting.getUserGroup()).thenReturn(CodeWhispererUserGroup.Control)
        val file = projectRule.fixture.addFileToProject("main.java", "public class Main {}")

        runInEdtAndWait {
            projectRule.fixture.openFileInEditor(file.virtualFile)
        }

        val actual = sut.getRequestContext(
            TriggerTypeInfo(CodewhispererTriggerType.OnDemand, CodeWhispererAutomatedTriggerType.Unknown()),
            projectRule.fixture.editor,
            projectRule.project,
            file,
            LatencyContext()
        )

        assertThat(actual.supplementalContext).isNull()
    }
}
