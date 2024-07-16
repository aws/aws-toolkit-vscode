// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.core.utils

import java.io.BufferedInputStream
import java.io.ByteArrayInputStream
import java.io.IOException
import java.io.InputStream
import java.nio.file.Files
import java.nio.file.Path
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream

/**
 * Adds a new [ZipEntry] with the contents of [file] to the [ZipOutputStream].
 */
fun ZipOutputStream.putNextEntry(entryName: String, file: Path) {
    try {
        BufferedInputStream(Files.newInputStream(file)).use { inputStream ->
            putNextEntry(entryName, inputStream)
        }
    } catch (e: IOException) {
        val bytes = Files.readAllBytes(file)
        putNextEntry(entryName, ByteArrayInputStream(bytes).buffered())
    }
}

/**
 * Adds a new [ZipEntry] with the contents of [inputStream] to the [ZipOutputStream].
 */
fun ZipOutputStream.putNextEntry(entryName: String, inputStream: InputStream) {
    this.putNextEntry(ZipEntry(entryName))
    inputStream.copyTo(this)
    this.closeEntry()
}

/**
 * Create a zip file in a temporary location.
 *
 * Statements included in [block] populate the zip file with entries.
 *
 * @return the [Path] of the temporary file
 */
fun createTemporaryZipFile(block: (ZipOutputStream) -> Unit): Path {
    val file = Files.createTempFile(null, ".zip")
    ZipOutputStream(Files.newOutputStream(file)).use(block)
    return file
}
