// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codemodernizer.panels.managers

import org.assertj.core.api.Assertions.assertThat
import org.junit.Before
import org.junit.Test
import org.mockito.kotlin.spy
import org.mockito.kotlin.times
import org.mockito.kotlin.verify
import software.aws.toolkits.jetbrains.services.codemodernizer.model.CodeModernizerJobCompletedResult
import software.aws.toolkits.jetbrains.services.codemodernizer.model.JobId
import software.aws.toolkits.jetbrains.services.codemodernizer.panels.LoadingPanel
import software.aws.toolkits.jetbrains.services.codemodernizer.panels.PanelTestBase
import java.awt.BorderLayout

class CodeModernizerBottomWindowPanelManagerTest : PanelTestBase() {
    private lateinit var codeModernizerBottomWindowPanelManagerMock: CodeModernizerBottomWindowPanelManager
    private lateinit var loadingPanelMock: LoadingPanel

    @Before
    override fun setup() {
        super.setup()
        codeModernizerBottomWindowPanelManagerMock = spy(CodeModernizerBottomWindowPanelManager(super.project))
        loadingPanelMock = spy(LoadingPanel(super.project))
        codeModernizerBottomWindowPanelManagerMock.fullSizeLoadingPanel = loadingPanelMock
    }

    @Test
    fun `test init sets layout`() {
        val layout = codeModernizerBottomWindowPanelManagerMock.layout as BorderLayout
        assertThat(codeModernizerBottomWindowPanelManagerMock.toolbar.component.isVisible).isTrue()
        assertThat(codeModernizerBottomWindowPanelManagerMock.fullSizeLoadingPanel.isVisible).isTrue()
        assertThat(BorderLayout.WEST).isEqualTo(layout.getConstraints(codeModernizerBottomWindowPanelManagerMock.toolbar.component))
        assertThat(BorderLayout.NORTH).isEqualTo(layout.getConstraints(codeModernizerBottomWindowPanelManagerMock.banner))
        assertThat(layout.getLayoutComponent(BorderLayout.EAST)).isNull()
    }

    @Test
    fun `test userInitiatedStopCodeModernizationUI()`() {
        codeModernizerBottomWindowPanelManagerMock.userInitiatedStopCodeModernizationUI()
        assertThat(loadingPanelMock).isEqualTo(codeModernizerBottomWindowPanelManagerMock.fullSizeLoadingPanel)
        verify(loadingPanelMock, times(0)).showSuccessUI()
        verify(codeModernizerBottomWindowPanelManagerMock, times(1)).banner
    }

    @Test
    fun `test setStopCodeModernizationUI() with success result`() {
        var resultMock: CodeModernizerJobCompletedResult = spy(CodeModernizerJobCompletedResult.JobCompletedSuccessfully(JobId("test-job-id")))
        codeModernizerBottomWindowPanelManagerMock.setJobFinishedUI(resultMock)
        verify(loadingPanelMock, times(0)).showFailureUI()
    }

    @Test
    fun `test setStopCodeModernizationUI() with failure result`() {
        var resultMock: CodeModernizerJobCompletedResult = spy(CodeModernizerJobCompletedResult.JobFailed(JobId("test-job-id"), "test-failure-reason"))
        codeModernizerBottomWindowPanelManagerMock.setJobFinishedUI(resultMock)
        verify(loadingPanelMock, times(0)).showSuccessUI()
        verify(codeModernizerBottomWindowPanelManagerMock, times(1)).banner
    }
}
