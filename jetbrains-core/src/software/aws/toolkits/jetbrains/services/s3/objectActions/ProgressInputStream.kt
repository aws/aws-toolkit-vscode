// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
package software.aws.toolkits.jetbrains.services.s3.objectActions

import com.intellij.openapi.progress.ProgressIndicator
import java.io.FilterInputStream
import java.io.IOException
import java.io.InputStream

class ProgressInputStream(private val inputStream: InputStream, val size: Int, private val indicator: ProgressIndicator) :
    FilterInputStream(inputStream) {
    private var closed: Boolean = false
    var progress: Int = 0
    private var marked = 0

    override fun read(): Int {
        val count = inputStream.read()
        if (count > 0) {
            progress += count
        }
        updateDisplay(progress, size)
        return count
    }

    override fun close() {
        super.close()
        if (closed) throw IOException("already closed")
        closed = true
    }

    override fun read(b: ByteArray, off: Int, len: Int): Int {
        val count = inputStream.read(b, off, len)
        if (count > 0)
            progress += count
        updateDisplay(progress, size)
        return count
    }

    override fun available(): Int = size - progress

    override fun mark(readlimit: Int) {
        marked = readlimit
    }

    override fun reset() {
        super.reset()
        progress = marked
    }

    private fun updateDisplay(progress: Int, size: Int) {
        indicator.fraction = progress * 1.0 / size
    }
}
