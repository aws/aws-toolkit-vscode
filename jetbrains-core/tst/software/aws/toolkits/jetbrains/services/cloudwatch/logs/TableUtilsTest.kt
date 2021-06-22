// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cloudwatch.logs

import com.intellij.util.text.DateFormatUtil
import org.assertj.core.api.Assertions.assertThat
import org.junit.Test
import software.aws.toolkits.jetbrains.services.cloudwatch.logs.editor.TimeFormatConversion
import java.text.SimpleDateFormat

class TableUtilsTest {
    private val sampleTime: Long = 1621173813000

    @Test
    fun `convert epoch time to string date time with seconds included`() {
        val showSeconds = true
        val correctTime = SimpleDateFormat("yyyy-MM-dd HH:mm:ss.SSS").format(sampleTime)
        val time = TimeFormatConversion.convertEpochTimeToStringDateTime(sampleTime, showSeconds)
        assertThat(time).isEqualTo(correctTime)
    }

    @Test
    fun `convert epoch time to string date time with seconds excluded`() {
        val showSeconds = false
        val correctTime = DateFormatUtil.getDateTimeFormat().format(sampleTime)
        val time = TimeFormatConversion.convertEpochTimeToStringDateTime(sampleTime, showSeconds)
        assertThat(time).isEqualTo(correctTime)
    }
}
