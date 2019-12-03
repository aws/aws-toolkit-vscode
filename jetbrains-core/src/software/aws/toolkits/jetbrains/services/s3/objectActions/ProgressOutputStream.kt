// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
package software.aws.toolkits.jetbrains.services.s3.objectActions

import com.intellij.openapi.progress.ProgressIndicator
import java.io.FilterOutputStream
import java.io.IOException
import java.io.OutputStream

class ProgressOutputStream(private val outputStream: OutputStream, val size: Long, private val indicator: ProgressIndicator) :
    FilterOutputStream(outputStream) {
    private var closed: Boolean = false
    var progress: Long = 0

    @Throws(IOException::class)
    override fun close() {
        super.close()
        if (closed) throw IOException("already closed")
        closed = true
    }

    override fun write(b: ByteArray?) {
        outputStream.write(b)
        progress += b?.size ?: 0
        updateProgress(progress)
    }

    override fun write(b: Int) {
        outputStream.write(b)
        progress += b
        updateProgress(progress)
    }

    override fun write(b: ByteArray?, off: Int, len: Int) {
        outputStream.write(b, off, len)
        progress += len
        updateProgress(progress)
    }

    private fun updateProgress(progress: Long) {
        indicator.fraction = progress * 1.0 / size
    }
}
