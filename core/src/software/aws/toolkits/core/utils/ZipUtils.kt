// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.core.utils

import java.io.InputStream
import java.nio.file.Files
import java.nio.file.Path
import java.util.zip.ZipEntry
import java.util.zip.ZipFile
import java.util.zip.ZipOutputStream

/**
 * Adds a new [ZipEntry] with the contents of [file] to the [ZipOutputStream].
 */
fun ZipOutputStream.putNextEntry(entryName: String, file: Path) {
    this.putNextEntry(ZipEntry(entryName))
    val bytes = Files.readAllBytes(file)
    this.write(bytes, 0, bytes.size)
    this.closeEntry()
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

/**
 * Returns a list of the file names in the Zip archive
 */
fun zipEntries(zipFile: Path): List<String> = ZipFile(zipFile.toFile()).use { zip ->
    zip.entries().asSequence().filterNot { it.isDirectory }.mapNotNull { it.name }.toList()
}
