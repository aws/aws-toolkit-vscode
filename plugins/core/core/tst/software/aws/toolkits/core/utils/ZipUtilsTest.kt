// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.core.utils

import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.fail
import org.junit.After
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.nio.charset.StandardCharsets
import java.nio.file.Files
import java.nio.file.Path
import java.util.zip.ZipFile
import java.util.zip.ZipOutputStream

class ZipUtilsTest {

    @Rule
    @JvmField
    val tmpFolder = TemporaryFolder()
    var zipFile: Path? = null

    @After fun cleanup() {
        if (zipFile != null) {
            Files.delete(zipFile)
        }
    }

    @Test fun fileCanBeAddedToAZip() {
        val fileToAdd = tmpFolder.newFile()
        fileToAdd.writeText("hello world", StandardCharsets.UTF_8)
        val zipFile = tmpFolder.newFile("blah.zip")?.toPath() ?: return fail("Couldn't create new file")

        ZipOutputStream(Files.newOutputStream(zipFile)).use {
            it.putNextEntry("file.txt", fileToAdd.toPath())
        }

        assertZipContainsHelloWorldFile(zipFile)
    }

    @Test fun inputStreamCanBeAddedToAZip() {
        val zipFile = tmpFolder.newFile("blah.zip")?.toPath() ?: return fail("Couldn't create new file")
        ZipOutputStream(Files.newOutputStream(zipFile)).use {
            it.putNextEntry("file.txt", "hello world".byteInputStream(StandardCharsets.UTF_8))
        }

        assertZipContainsHelloWorldFile(zipFile)
    }

    @Test fun shortcutToCreateATemporaryZip() {
        zipFile = createTemporaryZipFile {
            it.putNextEntry("file.txt", "hello world".byteInputStream(StandardCharsets.UTF_8))
        }

        assertZipContainsHelloWorldFile(zipFile!!)
    }

    private fun assertZipContainsHelloWorldFile(zipFile: Path) {
        ZipFile(zipFile.toFile()).use { actualZip ->
            val actualEntry = actualZip.entries().toList().find { it.name == "file.txt" }

            assertThat(actualEntry).isNotNull
            val contents = actualZip.getInputStream(actualEntry).bufferedReader(StandardCharsets.UTF_8).use { it.readText() }
            assertThat(contents).isEqualTo("hello world")
        }
    }
}
