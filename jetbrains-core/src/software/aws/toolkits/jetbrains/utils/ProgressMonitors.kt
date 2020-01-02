// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.utils

import com.intellij.openapi.progress.ProgressIndicator
import com.intellij.util.io.size
import java.io.FileInputStream
import java.io.FilterInputStream
import java.io.FilterOutputStream
import java.io.InputStream
import java.io.OutputStream
import java.nio.file.Path

class ProgressMonitorInputStream(
    indicator: ProgressIndicator,
    delegate: InputStream,
    length: Long,
    cancelable: Boolean = true
) : FilterInputStream(delegate) {

    private val monitor = ProgressMonitor(indicator, length, cancelable)
    private var marked: Long = 0

    override fun read(): Int = super.read().also { monitor.updateProgress(if (it >= 0) 1 else 0) }

    override fun read(b: ByteArray, off: Int, len: Int): Int = super.read(b, off, len).also { monitor.updateProgress(it.toLong()) }

    override fun skip(n: Long): Long = super.skip(n).also { monitor.updateProgress(it) }

    override fun mark(readlimit: Int) {
        super.mark(readlimit)
        marked = monitor.completed
    }

    override fun reset() {
        super.reset()
        monitor.completed = marked
        monitor.updateProgress(0)
    }

    companion object {
        fun fromFile(indicator: ProgressIndicator, path: Path): InputStream = ProgressMonitorInputStream(indicator, FileInputStream(path.toFile()), path.size())
    }
}

class ProgressMonitorOutputStream(indicator: ProgressIndicator, private val delegate: OutputStream, length: Long, cancelable: Boolean = true) :
    FilterOutputStream(delegate) {

    private val monitor = ProgressMonitor(indicator, length, cancelable)

    override fun write(b: Int) {
        super.write(b)
        monitor.updateProgress(1)
    }

    override fun write(b: ByteArray, off: Int, len: Int) {
        delegate.write(b, off, len)
        monitor.updateProgress(len.toLong())
    }
}

private class ProgressMonitor(private val indicator: ProgressIndicator, private val length: Long, private val cancelable: Boolean) {
    var completed: Long = 0

    fun updateProgress(increment: Long) {
        if (cancelable) {
            indicator.checkCanceled()
        }
        completed += increment
        if (!indicator.isIndeterminate) {
            indicator.fraction = completed.toDouble() / length.toDouble()
        }
    }
}
