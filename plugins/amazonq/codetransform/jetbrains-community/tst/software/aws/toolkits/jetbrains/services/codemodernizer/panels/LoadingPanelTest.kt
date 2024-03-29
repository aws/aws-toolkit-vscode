// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codemodernizer.panels

import org.assertj.core.api.Assertions.assertThat
import org.junit.Before
import org.junit.Test
import org.mockito.kotlin.spy
import java.awt.BorderLayout

class LoadingPanelTest : PanelTestBase() {
    private lateinit var loadingPanelMock: LoadingPanel

    @Before
    override fun setup() {
        super.setup()
        loadingPanelMock = spy(LoadingPanel(super.project))
    }

    @Test
    fun `test init sets layout`() {
        val layout = loadingPanelMock.layout as BorderLayout
        assertThat(loadingPanelMock.progressIndicatorPanel.isVisible).isFalse()
        assertThat(BorderLayout.CENTER).isEqualTo(layout.getConstraints(loadingPanelMock.progressIndicatorPanel))
        assertThat(layout.getLayoutComponent(BorderLayout.EAST)).isNull()
        assertThat(layout.getLayoutComponent(BorderLayout.WEST)).isNull()
    }

    @Test
    fun `test setDefaultUI()`() {
        loadingPanelMock.setDefaultUI()
        val layout = loadingPanelMock.layout as BorderLayout
        assertThat(loadingPanelMock.stopCodeScanButton.isVisible).isFalse()
        assertThat(loadingPanelMock.progressIndicatorLabel.isVisible).isTrue()
        assertThat(loadingPanelMock.progressIndicatorPanel.isVisible).isTrue()
        assertThat(BorderLayout.CENTER).isEqualTo(layout.getConstraints(loadingPanelMock.progressIndicatorPanel))
    }

    @Test
    fun `test showInProgressIndicator()`() {
        loadingPanelMock.showInProgressIndicator()
        assertThat(loadingPanelMock.progressIndicatorLabel.isVisible).isTrue()
    }

    @Test
    fun `test showFailureUI()`() {
        loadingPanelMock.showFailureUI()
        assertThat(loadingPanelMock.progressIndicatorPanel.isVisible).isFalse()
    }

    @Test
    fun `test showSuccessUI()`() {
        loadingPanelMock.showSuccessUI()
        assertThat(loadingPanelMock.progressIndicatorPanel.isVisible).isFalse()
    }
}
