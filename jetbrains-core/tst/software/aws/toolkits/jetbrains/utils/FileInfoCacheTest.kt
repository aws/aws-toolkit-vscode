// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.utils

import com.intellij.testFramework.ProjectRule
import com.intellij.util.containers.ContainerUtil
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.jetbrains.concurrency.Promise
import org.jetbrains.concurrency.all
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import software.aws.toolkits.resources.message
import java.io.File
import java.time.Instant

class FileInfoCacheTest {

    @Rule
    @JvmField
    val tempFolder = TemporaryFolder()

    @Rule
    @JvmField
    val projectRule = ProjectRule()

    @Test
    fun cachedResultsAreReturned() {
        var callCount = 0
        val tempFile = tempFolder.newFile()
        val filePath = tempFile.absolutePath
        val info = "v1"
        tempFile.writeText(info)

        val infoProvider = object : FileInfoCache<String>() {
            override fun getFileInfo(path: String): String {
                callCount++
                return File(filePath).readText()
            }
        }

        assertThat(infoProvider.evaluateBlocking(filePath).result).isEqualTo(info)
        assertThat(infoProvider.evaluateBlocking(filePath).result).isEqualTo(info)
        assertThat(callCount).isEqualTo(1)
    }

    @Test
    fun exceptionLeadsToCheckingAgain() {
        var callCount = 0
        val tempFile = tempFolder.newFile()
        val filePath = tempFile.absolutePath
        val info = "v1"
        tempFile.writeText(info)

        val infoProvider = object : FileInfoCache<String>() {
            override fun getFileInfo(path: String): String {
                try {
                    if (callCount == 0) {
                        throw RuntimeException("Simulated exception")
                    } else {
                        return File(filePath).readText()
                    }
                } finally {
                    callCount++
                }
            }
        }

        assertThatThrownBy { infoProvider.evaluateBlocking(filePath) }

        Thread.sleep(1000)
        tempFile.setLastModified(Instant.now().toEpochMilli())

        assertThat(infoProvider.evaluateBlocking(filePath).result).isEqualTo(info)
        assertThat(callCount).isEqualTo(2)
    }

    @Test
    fun updatingAFileLeadsToCheckingAgain() {
        var callCount = 0
        val tempFile = tempFolder.newFile()
        val filePath = tempFile.absolutePath
        var info = "v1"
        tempFile.writeText(info)

        val infoProvider = object : FileInfoCache<String>() {
            override fun getFileInfo(path: String): String {
                callCount++
                return File(filePath).readText()
            }
        }

        assertThat(infoProvider.evaluateBlocking(filePath).result).isEqualTo(info)

        // Mac timestamp granularity is 1 sec
        Thread.sleep(1000)

        info = "v2"
        tempFile.writeText(info)

        assertThat(infoProvider.evaluateBlocking(filePath).result).isEqualTo(info)
        assertThat(callCount).isEqualTo(2)
    }

    @Test
    fun emptyCache_SingleExecutableRequest() {
        val tempFile = tempFolder.newFile().also { it.writeText("tempFile") }
        val infoProvider = TestFileInfoCache()
        val pathPromise = infoProvider.evaluate(tempFile.absolutePath)
        waitAll(listOf(pathPromise))

        assertThat(pathPromise.blockingGet(0)!!.result).isEqualTo("tempFile")

        assertThat(infoProvider.testOnlyGetRequestCache()).hasSize(1)
            .describedAs("Cache size does not match expected value")
    }

    @Test
    fun nonEmptyCache_SingleExecutableRequest() {
        val tempFile = tempFolder.newFile().also { it.writeText("tempFile") }
        val infoProvider = TestFileInfoCache()
        val pathPromise = infoProvider.evaluate(tempFile.absolutePath)
        waitAll(listOf(pathPromise))

        // Get the value with no wait because the value should be already cached
        val samePathPromise = infoProvider.evaluate(tempFile.absolutePath).blockingGet(0)!!.result
        assertThat(samePathPromise).isEqualTo("tempFile")

        assertThat(infoProvider.testOnlyGetRequestCache()).hasSize(1)
            .describedAs("Cache size does not match expected value")
    }

    @Test
    fun differentExecutableRequests() {
        val tempFile1 = tempFolder.newFile().also { it.writeText("tempFile1") }
        val tempFile2 = tempFolder.newFile().also { it.writeText("tempFile2") }
        val infoProvider = TestFileInfoCache()

        val pathTempFile1Promise = infoProvider.evaluate(tempFile1.absolutePath)
        val pathTempFile2Promise = infoProvider.evaluate(tempFile2.absolutePath)
        waitAll(listOf(pathTempFile1Promise, pathTempFile2Promise))

        assertThat(pathTempFile1Promise.blockingGet(0)!!.result).isEqualTo("tempFile1")
        assertThat(pathTempFile2Promise.blockingGet(0)!!.result).isEqualTo("tempFile2")

        assertThat(infoProvider.testOnlyGetRequestCache()).hasSize(2)
            .describedAs("Cache size does not match expected value")
    }

    @Test
    fun multipleThreads_SameSamPath() {
        val threadsCount = 20
        val tempFile = tempFolder.newFile()
        val results = ContainerUtil.newConcurrentSet<Promise<FileInfoCache.InfoResult<String>>>()
        val infoProvider = TestFileInfoCache()

        val info = "v1"
        tempFile.writeText(info)

        fun retrieveVersion() {
            val promise = infoProvider.evaluate(tempFile.absolutePath)
            results.add(promise)
        }

        val threads = (1..threadsCount).map { Thread(::retrieveVersion).apply { start() } }.toList()
        for (thread in threads) {
            thread.join()
        }

        waitAll(results)

        assertThat(results).hasSize(1).describedAs("Number of threads does not match expected value")

        for (result in results) {
            assertThat(result.blockingGet(0)!!.result).isEqualTo(info)
        }

        assertThat(infoProvider.testOnlyGetRequestCache()).hasSize(1)
            .describedAs("Cache size does not match expected value")
    }

    @Test
    fun invalidExecutablePath() {
        val invalidPath = "invalid_path"

        assertThatThrownBy { TestFileInfoCache().evaluateBlocking(invalidPath) }
            .isInstanceOf(IllegalStateException::class.java)
            .hasMessage(message("general.file_not_found", invalidPath))
    }

    @Test
    fun testDeleteFileAfterReadingFromIt() {
        val tempFile = tempFolder.newFile()
        val path = tempFile.absolutePath

        val testFileInfoCache = object : FileInfoCache<String>() {
            override fun getFileInfo(path: String): String {
                val file = File(path)
                return try {
                    file.readText()
                } finally {
                    file.delete()
                }
            }
        }

        assertThatThrownBy { testFileInfoCache.evaluateBlocking(path) }
            .isInstanceOf(IllegalStateException::class.java)
            .hasMessage(message("general.file_not_found", path))
    }

    private class TestFileInfoCache : FileInfoCache<String>() {
        var callCount = 0
            private set

        override fun getFileInfo(path: String): String {
            try {
                return File(path).readText()
            } finally {
                callCount++
            }
        }
    }

    private fun waitAll(promises: Collection<Promise<*>>) {
        val all = promises.all(null, ignoreErrors = true)
        all.blockingGet(3000)
    }
}
