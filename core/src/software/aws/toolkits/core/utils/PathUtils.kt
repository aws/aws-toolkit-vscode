// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.core.utils

import java.io.InputStream
import java.io.OutputStream
import java.nio.charset.Charset
import java.nio.file.FileAlreadyExistsException
import java.nio.file.Files
import java.nio.file.NoSuchFileException
import java.nio.file.Path
import java.nio.file.attribute.FileTime
import java.nio.file.attribute.PosixFilePermission

fun Path.inputStream(): InputStream = Files.newInputStream(this)
fun Path.inputStreamIfExists(): InputStream? = try {
    inputStream()
} catch (e: NoSuchFileException) {
    null
}

fun Path.touch() {
    this.createParentDirectories()
    try {
        Files.createFile(this)
    } catch (_: FileAlreadyExistsException) { }
}

fun Path.outputStream(): OutputStream {
    this.createParentDirectories()
    return Files.newOutputStream(this)
}
fun Path.createParentDirectories() = Files.createDirectories(this.parent)
fun Path.exists() = Files.exists(this)
fun Path.deleteIfExists() = Files.deleteIfExists(this)
fun Path.lastModified(): FileTime = Files.getLastModifiedTime(this)
fun Path.readText(charset: Charset = Charsets.UTF_8) = toFile().readText(charset)
fun Path.writeText(text: String, charset: Charset = Charsets.UTF_8) = toFile().writeText(text, charset)
fun Path.filePermissions(permissions: Set<PosixFilePermission>) {
    // Comes from PosixFileAttributeView#name()
    if ("posix" in this.fileSystem.supportedFileAttributeViews()) {
        Files.setPosixFilePermissions(this, permissions)
    }
}
