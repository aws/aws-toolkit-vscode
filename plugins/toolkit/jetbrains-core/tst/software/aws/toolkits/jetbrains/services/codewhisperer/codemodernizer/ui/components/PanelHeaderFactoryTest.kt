// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.codemodernizer.ui.components

import org.assertj.core.api.Assertions.assertThat
import org.junit.Test
import org.mockito.kotlin.spy
import org.mockito.kotlin.times
import org.mockito.kotlin.verify
import software.aws.toolkits.jetbrains.services.codemodernizer.ui.components.PanelHeaderFactory

class PanelHeaderFactoryTest {
    @Test
    fun `panel header factory does create label with text`() {
        val panelHeaderText = "Test header"
        val panelHeaderFactoryMock = spy(PanelHeaderFactory())
        val panelHeaderMock = panelHeaderFactoryMock.createPanelHeader(panelHeaderText)
        verify(panelHeaderFactoryMock, times(1)).createPanelHeader(panelHeaderText)
        assertThat(panelHeaderMock.text).isEqualTo(panelHeaderText)
    }
}
