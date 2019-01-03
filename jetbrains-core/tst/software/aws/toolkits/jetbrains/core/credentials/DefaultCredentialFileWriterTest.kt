// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials

import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.IterableAssert
import org.junit.Assume
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.nio.file.Files
import java.nio.file.Paths
import java.nio.file.attribute.PosixFilePermission
import java.nio.file.attribute.PosixFilePermissions

class DefaultCredentialFileWriterTest {

    @Rule
    @JvmField
    val folderRule = TemporaryFolder()

    @Test
    fun canCreateCredentialsFileTemplateWithAppropriatePermissions() {
        val baseFolder = folderRule.newFolder()
        val file = Paths.get(baseFolder.absolutePath, ".aws", "credentials").toFile()
        val sut = DefaultCredentialFileWriter
        sut.createFile(file)

        assertThat(file).exists().hasContent(
            """
            [default]
            aws_access_key_id=
            aws_secret_access_key=
        """.trimIndent()
        )

        assumeNoException<UnsupportedOperationException> {
            assertThat(Files.getPosixFilePermissions(file.toPath())).matches("rw-------")
            assertThat(Files.getPosixFilePermissions(file.parentFile.toPath())).matches("rwx------")
        }
    }

    @Test
    fun existingFolderPermissionsAreNotModified() {
        val baseFolder = folderRule.newFolder()
        baseFolder.setExecutable(true, false)
        baseFolder.setWritable(true, false)
        baseFolder.setReadable(true, false)
        val file = Paths.get(baseFolder.absolutePath, "credentials").toFile()

        val sut = DefaultCredentialFileWriter
        sut.createFile(file)

        assumeNoException<UnsupportedOperationException> {
            assertThat(Files.getPosixFilePermissions(file.toPath())).matches("rw-------")
            assertThat(Files.getPosixFilePermissions(file.parentFile.toPath())).matches("rwxrwxrwx")
        }
    }

    private fun IterableAssert<PosixFilePermission>.matches(permissionString: String) {
        containsOnly(*PosixFilePermissions.fromString(permissionString).toTypedArray())
    }

    private inline fun <reified T> assumeNoException(block: () -> Unit) {
        try {
            block()
        } catch (e: Exception) {
            if (e is T) {
                Assume.assumeNoException(e)
            } else {
                throw e
            }
        }
    }
}