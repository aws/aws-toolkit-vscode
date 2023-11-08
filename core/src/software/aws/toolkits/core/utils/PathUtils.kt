// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.core.utils

import org.slf4j.Logger
import java.io.InputStream
import java.io.OutputStream
import java.nio.charset.Charset
import java.nio.file.AccessMode
import java.nio.file.FileAlreadyExistsException
import java.nio.file.Files
import java.nio.file.NoSuchFileException
import java.nio.file.Path
import java.nio.file.attribute.AclEntry
import java.nio.file.attribute.AclFileAttributeView
import java.nio.file.attribute.FileTime
import java.nio.file.attribute.PosixFilePermission
import java.nio.file.attribute.PosixFilePermissions
import java.nio.file.attribute.UserPrincipal
import kotlin.io.path.getPosixFilePermissions
import kotlin.io.path.isRegularFile

val POSIX_OWNER_ONLY_FILE = setOf(PosixFilePermission.OWNER_READ, PosixFilePermission.OWNER_WRITE)
val POSIX_OWNER_ONLY_DIR = setOf(PosixFilePermission.OWNER_READ, PosixFilePermission.OWNER_WRITE, PosixFilePermission.OWNER_EXECUTE)

fun Path.inputStream(): InputStream = Files.newInputStream(this)
fun Path.inputStreamIfExists(): InputStream? = try {
    inputStream()
} catch (e: NoSuchFileException) {
    null
}

fun Path.touch(restrictToOwner: Boolean = false) {
    try {
        if (!restrictToOwner || !hasPosixFilePermissions()) {
            Files.createFile(this)
        } else {
            Files.createFile(this, PosixFilePermissions.asFileAttribute(POSIX_OWNER_ONLY_FILE))
        }
    } catch (_: FileAlreadyExistsException) {}
}

fun Path.outputStream(): OutputStream {
    this.createParentDirectories()
    return Files.newOutputStream(this)
}

fun Path.createParentDirectories(restrictToOwner: Boolean = false) = if (!restrictToOwner || !hasPosixFilePermissions()) {
    Files.createDirectories(this.parent)
} else {
    Files.createDirectories(this.parent, PosixFilePermissions.asFileAttribute(POSIX_OWNER_ONLY_DIR))
}

fun Path.exists() = Files.exists(this)
fun Path.deleteIfExists() = Files.deleteIfExists(this)
fun Path.lastModified(): FileTime = Files.getLastModifiedTime(this)
fun Path.readText(charset: Charset = Charsets.UTF_8) = toFile().readText(charset)
fun Path.writeText(text: String, charset: Charset = Charsets.UTF_8) = toFile().writeText(text, charset)
fun Path.appendText(text: String, charset: Charset = Charsets.UTF_8) = toFile().appendText(text, charset)

// Comes from PosixFileAttributeView#name()
fun Path.hasPosixFilePermissions() = "posix" in this.fileSystem.supportedFileAttributeViews()
fun Path.filePermissions(permissions: Set<PosixFilePermission>) {
    if (hasPosixFilePermissions()) {
        Files.setPosixFilePermissions(this, permissions)
    }
}

fun Path.tryDirOp(log: Logger, block: Path.() -> Unit) {
    try {
        log.debug { "dir op on $this" }
        block(this)
    } catch (e: Exception) {
        if (e !is java.nio.file.AccessDeniedException && e !is kotlin.io.AccessDeniedException) {
            throw e
        }

        if (!hasPosixFilePermissions()) {
            throw tryAugmentExceptionMessage(e, this)
        }

        log.info(e) { "Attempting to handle ADE for directory operation" }
        try {
            var parent = if (this.isRegularFile()) { parent } else { this }

            while (parent != null) {
                if (!parent.exists()) {
                    log.info { "${parent.toAbsolutePath()}: does not exist yet" }
                } else {
                    if (tryOrNull { parent.fileSystem.provider().checkAccess(parent, AccessMode.READ, AccessMode.WRITE, AccessMode.EXECUTE) } != null) {
                        log.debug { "$parent has rwx, exiting" }
                        // can assume parent permissions are correct
                        break
                    }

                    log.debug { "fixing perms for $parent" }
                    parent.tryFixPerms(log, POSIX_OWNER_ONLY_DIR)
                }

                parent = parent.parent
            }
        } catch (e2: Exception) {
            log.warn(e2) { "Encountered error while handling ADE for ${e.message}" }

            throw tryAugmentExceptionMessage(e, this)
        }

        log.info { "Done attempting to handle ADE for directory operation" }
        block(this)
    }
}

fun<T> Path.tryFileOp(log: Logger, block: Path.() -> T) =
    try {
        log.debug { "file op on $this" }
        block(this)
    } catch (e: Exception) {
        if (e !is java.nio.file.AccessDeniedException && e !is kotlin.io.AccessDeniedException) {
            throw e
        }

        if (!hasPosixFilePermissions()) {
            throw tryAugmentExceptionMessage(e, this)
        }

        log.info(e) { "Attempting to handle ADE for file operation" }
        try {
            log.debug { "fixing perms for $this" }
            tryFixPerms(log, POSIX_OWNER_ONLY_FILE)
        } catch (e2: Exception) {
            log.warn(e2) { "Encountered error while handling ADE for ${e.message}" }

            throw tryAugmentExceptionMessage(e, this)
        }

        log.info { "Done attempting to handle ADE for file operation" }
        block(this)
    }

private fun Path.tryFixPerms(log: Logger, desiredPermissions: Set<PosixFilePermission>) {
    // TODO: consider handling linux ACLs
    // only try ops if we own the file
    // (ab)use invariant that chmod only works if you are root or the file owner
    val perms = tryOrLogShortException(log) { Files.getPosixFilePermissions(this) }
    val ownership = tryOrLogShortException(log) { Files.getOwner(this) }

    log.info { "Permissions for ${toAbsolutePath()}: $ownership, $perms" }
    if (perms != null && ownership != null) {
        if (ownership.name != "root" && tryOrNull { filePermissions(perms) } != null) {
            val permissions = perms + desiredPermissions
            log.info { "Setting perms for ${toAbsolutePath()}: $permissions" }
            filePermissions(permissions)
        }
    }
}

private fun tryAugmentExceptionMessage(e: Exception, path: Path): Exception {
    if (e !is java.nio.file.AccessDeniedException && e !is kotlin.io.AccessDeniedException) {
        return e
    }

    var potentialProblem = if (path.exists()) { path } else { path.parent }
    var acls: List<AclEntry>? = null
    var ownership: UserPrincipal? = null
    while (potentialProblem != null) {
        acls = tryOrNull { Files.getFileAttributeView(potentialProblem, AclFileAttributeView::class.java).acl }
        ownership = tryOrNull { Files.getOwner(potentialProblem) }

        if (acls != null || ownership != null) {
            break
        }

        potentialProblem = potentialProblem.parent
    }

    val message = buildString {
        // $path is automatically added to the front of the exception message
        appendLine("Exception trying to perform operation")

        if (potentialProblem != null) {
            append("Potential issue is with $potentialProblem")

            if (ownership != null) {
                append(", which has owner: $ownership")
            }

            if (acls != null) {
                append(", and ACL entries for: ${acls.map { it.principal() }}")
            }

            val posixPermissions = tryOrNull { PosixFilePermissions.toString(potentialProblem.getPosixFilePermissions()) }
            if (posixPermissions != null) {
                append(", and POSIX permissions: $posixPermissions")
            }
        }
    }

    return when (e) {
        is kotlin.io.AccessDeniedException -> kotlin.io.AccessDeniedException(e.file, e.other, message)
        is java.nio.file.AccessDeniedException -> java.nio.file.AccessDeniedException(e.file, e.otherFile, message)
        // should never happen
        else -> e
    }.also {
        it.stackTrace = e.stackTrace
    }
}

private fun<T> tryOrLogShortException(log: Logger, block: () -> T) = try {
    block()
} catch (e: Exception) {
    log.warn { "${e::class.simpleName}: ${e.message}" }
    null
}
