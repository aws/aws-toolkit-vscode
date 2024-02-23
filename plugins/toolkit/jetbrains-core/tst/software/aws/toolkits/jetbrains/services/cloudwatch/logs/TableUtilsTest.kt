// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cloudwatch.logs

import com.intellij.ui.table.JBTable
import com.intellij.util.text.SyncDateFormat
import com.intellij.util.ui.ListTableModel
import org.assertj.core.api.Assertions.assertThat
import org.junit.Test
import org.mockito.kotlin.mock
import org.mockito.kotlin.whenever
import software.amazon.awssdk.services.cloudwatchlogs.model.LogStream
import software.aws.toolkits.jetbrains.services.cloudwatch.logs.editor.LogStreamsDateColumn
import software.aws.toolkits.jetbrains.services.cloudwatch.logs.editor.LogStreamsStreamColumn
import java.text.SimpleDateFormat
import java.time.ZoneId
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import java.util.Locale
import javax.swing.SortOrder

class TableUtilsTest {
    @Test
    fun `sorting must be enabled to work`() {
        assertThat(LogStreamsDateColumn(sortable = false).comparator).isNull()
        assertThat(LogStreamsDateColumn(sortable = true).comparator).isNotNull

        assertThat(LogStreamsStreamColumn(sortable = false).comparator).isNull()
        assertThat(LogStreamsStreamColumn(sortable = true).comparator).isNotNull
    }

    @Test
    fun `test short MDY sorting`() {
        val dateFormat = SimpleDateFormat("M/d/yy", Locale.ENGLISH)
        val table = JBTable(createTestMode(dateFormat))

        assertThat(table).satisfies {
            assertThat(it.getValueAt(0, 0)).isEqualTo("7/11/21")
            assertThat(it.getValueAt(1, 0)).isEqualTo("6/11/21")
            assertThat(it.getValueAt(2, 0)).isEqualTo("2/1/21")
        }
    }

    @Test
    fun `test medium MDY sorting`() {
        val dateFormat = SimpleDateFormat("MMM d, y", Locale.ENGLISH)
        val table = JBTable(createTestMode(dateFormat))

        assertThat(table).satisfies {
            assertThat(it.getValueAt(0, 0)).isEqualTo("Jul 11, 2021")
            assertThat(it.getValueAt(1, 0)).isEqualTo("Jun 11, 2021")
            assertThat(it.getValueAt(2, 0)).isEqualTo("Feb 1, 2021")
        }
    }

    @Test
    fun `test medium DMY sorting`() {
        val dateFormat = SimpleDateFormat("d MMM y", Locale.ENGLISH)
        val table = JBTable(createTestMode(dateFormat))

        assertThat(table).satisfies {
            assertThat(it.getValueAt(0, 0)).isEqualTo("11 Jul 2021")
            assertThat(it.getValueAt(1, 0)).isEqualTo("11 Jun 2021")
            assertThat(it.getValueAt(2, 0)).isEqualTo("1 Feb 2021")
        }
    }

    private fun createTestMode(format: SimpleDateFormat) = ListTableModel(
        arrayOf(LogStreamsDateColumn(sortable = true, SyncDateFormat(format))),
        mutableListOf(
            mockLogStream(stringToEpoch("2021-06-11T00:00:00-08:00")),
            mockLogStream(stringToEpoch("2021-02-01T00:00:00-08:00")),
            mockLogStream(stringToEpoch("2021-07-11T00:00:00-08:00")),
        ),
        0,
        SortOrder.DESCENDING
    )

    private fun stringToEpoch(string: String) = ZonedDateTime.parse(string, DateTimeFormatter.ISO_ZONED_DATE_TIME)
        .toLocalDateTime()
        .atZone(ZoneId.systemDefault())
        .toInstant()
        .toEpochMilli()

    private fun mockLogStream(epoch: Long): LogStream {
        val stream: LogStream = mock()
        whenever(stream.lastEventTimestamp()).thenReturn(epoch)

        return stream
    }
}
