// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.utils

import com.intellij.openapi.progress.ProgressIndicator
import com.nhaarman.mockitokotlin2.mock
import com.nhaarman.mockitokotlin2.verify
import org.assertj.core.api.Assertions.assertThat
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.FileOutputStream
import java.nio.charset.StandardCharsets

class ProgressMonitorOutputStreamTest {
    @JvmField
    @Rule
    val folder = TemporaryFolder()

    val mock = mock<ProgressIndicator>()

    @Test
    fun canReportProgressAsOutputStreamIsWritten() {
        val file = folder.newFile()

        ProgressMonitorOutputStream(mock, FileOutputStream(file), 10).use { sut ->
            sut.write(Byte.MIN_VALUE.toInt())
        }

        verify(mock).fraction = 0.1
    }

    @Test
    fun canReportProgressAsOutputStreamIsWrittenWithAnArray() {
        val file = folder.newFile()

        val helloWorld = "hello world".toByteArray(StandardCharsets.UTF_8)

        ProgressMonitorOutputStream(mock, FileOutputStream(file), 100).use { sut ->
            sut.write(helloWorld)
        }

        verify(mock).fraction = 0.11
        assertThat(file).hasContent("hello world")
    }
}
