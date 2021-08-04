// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cloudwatch.logs

import com.intellij.ui.table.JBTable
import com.intellij.util.text.DateFormatUtil
import com.intellij.util.text.SyncDateFormat
import com.intellij.util.ui.ListTableModel
import org.assertj.core.api.Assertions.assertThat
import org.junit.Test
import org.mockito.kotlin.mock
import org.mockito.kotlin.whenever
import software.amazon.awssdk.services.cloudwatchlogs.model.LogStream
import software.aws.toolkits.jetbrains.services.cloudwatch.logs.editor.LogStreamsDateColumn
import software.aws.toolkits.jetbrains.services.cloudwatch.logs.editor.TimeFormatConversion
import java.text.SimpleDateFormat
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.util.Locale
import javax.swing.RowSorter
import javax.swing.SortOrder

class TableUtilsTest {
    @Test
    fun `test short MDY sorting`() {
        val dateFormat = SimpleDateFormat("M/d/yy", Locale.ENGLISH)

        val model = ListTableModel(
            arrayOf(LogStreamsDateColumn(SyncDateFormat(dateFormat))),
            mutableListOf(
                mockLogStream(stringToEpoch("6/11/21", dateFormat)),
                mockLogStream(stringToEpoch("2/1/21", dateFormat)),
                mockLogStream(stringToEpoch("7/11/21", dateFormat)),
            )
        )

        val table = JBTable(model).also {
            it.rowSorter.sortKeys = listOf(RowSorter.SortKey(0, SortOrder.DESCENDING))
        }

        assertThat(table).satisfies {
            assertThat(it.getValueAt(0, 0)).isEqualTo("7/11/21")
            assertThat(it.getValueAt(1, 0)).isEqualTo("6/11/21")
            assertThat(it.getValueAt(2, 0)).isEqualTo("2/1/21")
        }
    }

    @Test
    fun `test medium MDY sorting`() {
        val dateFormat = SimpleDateFormat("MMM d, y", Locale.ENGLISH)

        val model = ListTableModel(
            arrayOf(LogStreamsDateColumn(SyncDateFormat(dateFormat))),
            mutableListOf(
                mockLogStream(stringToEpoch("Jun 11, 2021", dateFormat)),
                mockLogStream(stringToEpoch("Feb 1, 2021", dateFormat)),
                mockLogStream(stringToEpoch("Jul 11, 2021", dateFormat)),
            )
        )

        val table = JBTable(model).also {
            it.rowSorter.sortKeys = listOf(RowSorter.SortKey(0, SortOrder.DESCENDING))
        }

        assertThat(table).satisfies {
            assertThat(it.getValueAt(0, 0)).isEqualTo("Jul 11, 2021")
            assertThat(it.getValueAt(1, 0)).isEqualTo("Jun 11, 2021")
            assertThat(it.getValueAt(2, 0)).isEqualTo("Feb 1, 2021")
        }
    }

    @Test
    fun `test medium DMY sorting`() {
        val dateFormat = SimpleDateFormat("d MMM y", Locale.ENGLISH)

        val model = ListTableModel(
            arrayOf(LogStreamsDateColumn(SyncDateFormat(dateFormat))),
            mutableListOf(
                mockLogStream(stringToEpoch("11 Jun 2021", dateFormat)),
                mockLogStream(stringToEpoch("1 Feb 2021", dateFormat)),
                mockLogStream(stringToEpoch("11 Jul 2021", dateFormat)),
            )
        )

        val table = JBTable(model).also {
            it.rowSorter.sortKeys = listOf(RowSorter.SortKey(0, SortOrder.DESCENDING))
        }

        assertThat(table).satisfies {
            assertThat(it.getValueAt(0, 0)).isEqualTo("11 Jul 2021")
            assertThat(it.getValueAt(1, 0)).isEqualTo("11 Jun 2021")
            assertThat(it.getValueAt(2, 0)).isEqualTo("1 Feb 2021")
        }
    }

    @Test
    fun `convert epoch time to string date time with seconds included`() {
        val epochTime = 1621173813000
        val showSeconds = true
        val correctTime = SimpleDateFormat("yyyy-MM-dd HH:mm:ss.SSS").format(epochTime)
        val time = TimeFormatConversion.convertEpochTimeToStringDateTime(epochTime, showSeconds)
        assertThat(time).isEqualTo(correctTime)
    }

    @Test
    fun `convert epoch time to string date time with seconds excluded`() {
        val epochTime = 1621173813000
        val showSeconds = false
        val correctTime = DateFormatUtil.getDateTimeFormat().format(epochTime)
        val time = TimeFormatConversion.convertEpochTimeToStringDateTime(epochTime, showSeconds)
        assertThat(time).isEqualTo(correctTime)
    }

    private fun stringToEpoch(string: String, formatter: SimpleDateFormat) =
        LocalDate.parse(string, DateTimeFormatter.ofPattern(formatter.toPattern(), Locale.ENGLISH))
            .atTime(LocalTime.NOON.atOffset(ZoneOffset.UTC))
            .toInstant()
            .toEpochMilli()

    private fun mockLogStream(epoch: Long): LogStream {
        val stream: LogStream = mock()
        whenever(stream.lastEventTimestamp()).thenReturn(epoch)

        return stream
    }
}
