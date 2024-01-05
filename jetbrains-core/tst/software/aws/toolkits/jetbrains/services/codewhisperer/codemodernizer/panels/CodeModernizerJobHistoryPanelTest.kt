// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.codemodernizer.panels

import org.assertj.core.api.Assertions.assertThat
import org.junit.Test
import org.mockito.kotlin.spy
import org.mockito.kotlin.times
import org.mockito.kotlin.verify
import software.aws.toolkits.jetbrains.services.codemodernizer.model.JobHistoryItem
import software.aws.toolkits.jetbrains.services.codemodernizer.panels.CodeModernizerJobHistoryTablePanel
import java.time.Duration
import java.time.Instant

class CodeModernizerJobHistoryPanelTest {
    @Test
    fun `does render table with headers and text`() {
        val testData = arrayOf(
            JobHistoryItem("Java8Test", "Completed", Instant.now(), Duration.ZERO, "MockJobId"),
        )
        val tablePanelMock = spy(CodeModernizerJobHistoryTablePanel())
        tablePanelMock.setDefaultUI()
        tablePanelMock.updateTableData(testData)
        verify(tablePanelMock, times(1)).setDefaultUI()
        verify(tablePanelMock, times(1)).updateTableData(testData)
        assertThat(tablePanelMock.headerLabel.text).isEqualTo("Transformation job history")
        assertThat(tablePanelMock.jbTable.columnCount).isEqualTo(5)
        assertThat(tablePanelMock.jbTable.isEmpty).isFalse()
        assertThat(tablePanelMock.tableData).isEqualTo(testData)
    }
}
