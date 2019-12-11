// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.utils

import com.intellij.openapi.progress.ProgressIndicator
import com.nhaarman.mockitokotlin2.mock
import com.nhaarman.mockitokotlin2.verify
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

class ProgressMonitorInputStreamTest {

    @JvmField
    @Rule
    val folder = TemporaryFolder()

    val mock = mock<ProgressIndicator>()

    @Test
    fun canReportProgressAsInputStreamIsRead() {
        val file = folder.newFile()
        file.writeBytes(ByteArray(100))

        ProgressMonitorInputStream.fromFile(mock, file.toPath()).use { sut ->
            sut.read()
        }

        verify(mock).fraction = 0.01
    }

    @Test
    fun canReportProgressWhenByteArrayIsUsed() {
        val file = folder.newFile()
        file.writeBytes(ByteArray(100))

        ProgressMonitorInputStream.fromFile(mock, file.toPath()).use { sut ->
            var read = 10
            while (read > 0) {
                read = -sut.read(ByteArray(read))
            }
        }

        verify(mock).fraction = 0.10
    }
}
