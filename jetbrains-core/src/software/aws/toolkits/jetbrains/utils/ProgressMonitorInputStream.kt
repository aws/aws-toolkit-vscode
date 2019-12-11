// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.utils

import com.intellij.openapi.progress.ProgressIndicator
import com.intellij.util.io.size
import java.io.FileInputStream
import java.io.FilterInputStream
import java.io.InputStream
import java.nio.file.Path

class ProgressMonitorInputStream(
    private val indicator: ProgressIndicator,
    delegate: InputStream,
    private val length: Long,
    private val noOpReset: Boolean = false, // required to support S3 until SDK fixes https://github.com/aws/aws-sdk-java-v2/issues/1544
    private val cancelable: Boolean = true
) : FilterInputStream(delegate) {

    private var count: Long = 0
    private var marked: Long = 0

    override fun read(): Int = super.read().also { updateProgress(if (it >= 0) 1 else 0) }

    override fun read(b: ByteArray, off: Int, len: Int): Int = super.read(b, off, len).also { updateProgress(it.toLong()) }

    override fun skip(n: Long): Long = super.skip(n).also { updateProgress(it) }

    override fun mark(readlimit: Int) {
        super.mark(readlimit)
        marked = count
    }

    override fun reset() {
        if (noOpReset) return
        super.reset()
        count = marked
        updateProgress(0)
    }

    private fun updateProgress(increment: Long) {
        if (cancelable) {
            indicator.checkCanceled()
        }
        count += increment
        if (!indicator.isIndeterminate) {
            indicator.fraction = count.toDouble() / length.toDouble()
        }
    }

    companion object {
        fun fromFile(indicator: ProgressIndicator, path: Path, noOpReset: Boolean = false): InputStream =
            ProgressMonitorInputStream(indicator, FileInputStream(path.toFile()), path.size(), noOpReset = noOpReset)
    }
}
