// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.settings

import com.intellij.openapi.util.SystemInfo
import com.intellij.openapi.util.io.FileUtil
import org.assertj.core.api.Assertions.assertThat
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import software.aws.toolkits.core.rules.EnvironmentVariableHelper
import java.io.File

abstract class ExecutableDetectorTestBase {
    @Rule
    @JvmField
    val envHelper = EnvironmentVariableHelper()

    @Rule
    @JvmField
    val tempFolderRule = TemporaryFolder()

    lateinit var detector: ExecutableDetector
    lateinit var tempFolder: String

    @Before
    open fun setUp() {
        envHelper.remove("PATH")

        tempFolder = "${tempFolderRule.newFolder()}${File.separator}"

        detector = ExecutableDetector()
    }

    private fun sanitizePath(original: String): String = original.trimStart(File.separatorChar).replace("^(\\w):".toRegex()) { "${it.groupValues[1]}_" }

    private fun unsanitizePath(sanitized: String?): String? {
        val suffix = sanitized?.removePrefix(tempFolder)?.replace("^(\\w)_".toRegex()) { "${it.groupValues[1]}:" }
        return suffix?.let { if (SystemInfo.isUnix) "${File.separator}$suffix" else suffix }
    }

    protected fun assertExecutable(paths: Array<String>, executables: Array<String>, expected: String?) {
        assertThat(unsanitizePath(detector.find(paths, executables))).isEqualTo(expected)
    }

    protected fun touch(path: String): File {
        val sanitized = sanitizePath(path)
        val actualFile = File(tempFolder, sanitized)
        assertThat(FileUtil.createIfDoesntExist(actualFile)).isTrue()
        return actualFile
    }
}

class ExecutableDetectorTest : ExecutableDetectorTestBase() {
    @Before
    override fun setUp() {
        super.setUp()
    }

    @Test
    fun testDefinedPath() {
        val executable = "sam"
        val tempDirectory = FileUtil.createTempDirectory("tempSam", null)
        val expected = File(tempDirectory, executable).absolutePath
        val actualPath = touch(expected).parent

        assertExecutable(arrayOf(actualPath), arrayOf(executable), expected)
    }

    @Test
    fun testDefinedPathMultipleExecutables() {
        val executable = "sam"
        val tempDirectory = FileUtil.createTempDirectory("tempSam", null)
        val expected = File(tempDirectory, executable).absolutePath
        val actualPath = touch(expected).parent

        assertExecutable(arrayOf(actualPath), arrayOf("exe1", "exe2", "exe3", executable), expected)
    }

    @Test
    fun testDefinedMultiplePaths() {
        val executable = "sam"
        val tempDirectory = FileUtil.createTempDirectory("tempSam", null)
        val expected = File(tempDirectory, executable).absolutePath
        val actualPath = touch(expected).parent

        assertExecutable(arrayOf("path1", "path2", "path3", actualPath), arrayOf(executable), expected)
    }

    @Test
    fun testPath() {
        val executable = "sam"
        val tempDirectory = FileUtil.createTempDirectory("tempSam", null)
        val expected = File(tempDirectory, executable).absolutePath
        val actualPath = touch(expected).parent
        envHelper["PATH"] = actualPath

        assertExecutable(arrayOf(), arrayOf(executable), expected)
    }

    @Test
    fun testPathMultipleExecutables() {
        val executable = "sam"
        val tempDirectory = FileUtil.createTempDirectory("tempSam", null)
        val expected = File(tempDirectory, executable).absolutePath
        val actualPath = touch(expected).parent
        envHelper["PATH"] = actualPath

        assertExecutable(arrayOf(), arrayOf("exe1", "exe2", "exe3", executable), expected)
    }

    @Test
    fun returnNullIfNotFound() {
        val executable = "sam"
        val tempDirectory = FileUtil.createTempDirectory("tempSam", null)
        val expected = File(tempDirectory, executable).absolutePath
        touch(expected)

        assertThat(detector.find(arrayOf("thisIsNotTheRightDir"), arrayOf(executable))).isNull()
    }
}
