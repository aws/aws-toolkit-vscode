// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.sam

import com.intellij.util.containers.ContainerUtil
import com.intellij.util.text.SemVer
import org.jetbrains.concurrency.Promise
import org.jetbrains.concurrency.all
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.rules.ExpectedException
import software.aws.toolkits.jetbrains.utils.rules.HeavyJavaCodeInsightTestFixtureRule
import software.aws.toolkits.resources.message
import java.util.concurrent.ExecutionException

class SamVersionCacheTest {

    @JvmField
    @Rule
    val expectedException: ExpectedException = ExpectedException.none()

    @Rule
    @JvmField
    val projectRule = HeavyJavaCodeInsightTestFixtureRule()

    @After
    fun tearDown() {
        SamVersionCache.testOnlyGetRequestCache().clear()
    }

    @Test
    fun evaluate_EmptyCache_SingleExecutableRequest() {
        val samPath = SamCommonTestUtils.makeATestSam(SamCommonTestUtils.getMinVersionAsJson()).toString()
        val pathPromise = SamVersionCache.evaluate(samPath)
        waitAll(listOf(pathPromise))

        assertEquals(
            "Not cached SAM CLI version value check failure",
            SamCommon.expectedSamMinVersion.rawVersion,
            pathPromise.blockingGet(0)?.rawVersion
        )

        val cache = SamVersionCache.testOnlyGetRequestCache()
        assertEquals("Cache size does not match expected value", 1, cache.size)
    }

    @Test
    fun evaluate_NonEmptyCache_SingleExecutableRequest() {
        val samPath = SamCommonTestUtils.makeATestSam(SamCommonTestUtils.getMinVersionAsJson()).toString()
        val pathPromise = SamVersionCache.evaluate(samPath)
        waitAll(listOf(pathPromise))

        // Get the value with no wait because the value should be already cached
        val samePathPromise = SamVersionCache.evaluate(samPath).blockingGet(0)
        assertEquals(
            "Cached SAM CLI version value check failure",
            SamCommon.expectedSamMinVersion.rawVersion,
            samePathPromise?.rawVersion
        )

        val cache = SamVersionCache.testOnlyGetRequestCache()
        assertEquals("Cache size does not match expected value", 1, cache.size)
    }

    @Test
    fun evaluate_DifferentExecutableRequests() {
        val samMinPath = SamCommonTestUtils.makeATestSam(SamCommonTestUtils.getMinVersionAsJson()).toString()
        val samMaxPath = SamCommonTestUtils.makeATestSam(SamCommonTestUtils.getMaxVersionAsJson()).toString()

        val pathMinPromise = SamVersionCache.evaluate(samMinPath)
        val pathMaxPromise = SamVersionCache.evaluate(samMaxPath)
        waitAll(listOf(pathMinPromise, pathMaxPromise))

        assertEquals(
            "SAM CLI (min) version check failure",
            SamCommon.expectedSamMinVersion.rawVersion,
            pathMinPromise.blockingGet(0)?.rawVersion
        )

        assertEquals(
            "SAM CLI (max) version check failure",
            SamCommon.expectedSamMaxVersion.rawVersion,
            pathMaxPromise.blockingGet(0)?.rawVersion)

        val cache = SamVersionCache.testOnlyGetRequestCache()
        assertEquals("Cache size does not match expected value", 2, cache.size)
    }

    @Test
    fun evaluate_MultipleThreads_SameSamPath() {
        val threadsCount = 20
        val samPath = SamCommonTestUtils.makeATestSam(SamCommonTestUtils.getMinVersionAsJson()).toString()
        val results = ContainerUtil.newConcurrentSet<Promise<SemVer>>()

        fun retrieveVersion() {
            val promise = SamVersionCache.evaluate(samPath)
            results.add(promise)
        }

        val threads = (1..threadsCount).map { Thread(::retrieveVersion).apply { start() } }.toList()
        for (thread in threads) {
            thread.join()
        }

        waitAll(results)

        assertEquals("Number of threads does not match expected value", 1, results.size)

        for (result in results) {
            assertEquals(
                "SAM CLI version check failure",
                SamCommon.expectedSamMinVersion.rawVersion,
                result.blockingGet(0)?.rawVersion
            )
        }

        val cache = SamVersionCache.testOnlyGetRequestCache()
        assertEquals("Cache size does not match expected value", 1, cache.size)
    }

    @Test(expected = ExecutionException::class)
    fun evaluate_InvalidSamExecutablePath() {
        val pathPromise = SamVersionCache.evaluate("invalid_path")
        waitAll(listOf(pathPromise))

        pathPromise.blockingGet(0)
    }

    @Test
    fun getFileInfo_SamCliMinVersion() {
        val samPath = SamCommonTestUtils.makeATestSam(SamCommonTestUtils.getMinVersionAsJson()).toString()
        val samVersion = SamVersionCache.getFileInfo(samPath)
        assertEquals("Mismatch SAM executable version", samVersion, SamCommon.expectedSamMinVersion)
    }

    @Test
    fun getFileInfo_SamCliInvalidVersion() {
        val version = "0.0.a"

        expectedException.expect(IllegalStateException::class.java)
        expectedException.expectMessage(message("sam.executable.version_parse_error", version))

        val samPath = SamCommonTestUtils.makeATestSam(SamCommonTestUtils.getVersionAsJson(version)).toString()
        SamVersionCache.getFileInfo(samPath)
    }

    @Test
    fun getFileInfo_ErrorCode_RandomError() {
        val message = "No such file or directory"

        expectedException.expect(IllegalStateException::class.java)
        expectedException.expectMessage(message)

        val samPath = SamCommonTestUtils.makeATestSam(message, exitCode = 1).toString()
        SamVersionCache.getFileInfo(samPath)
    }

    @Test
    fun getFileInfo_ErrorCode_InvalidOption() {
        val message = "Error: no such option: --some_option"

        expectedException.expect(IllegalStateException::class.java)
        expectedException.expectMessage(message("sam.executable.unexpected_output", message))

        val samPath = SamCommonTestUtils.makeATestSam(message, exitCode = 1).toString()
        SamVersionCache.getFileInfo(samPath)
    }

    @Test
    fun getFileInfo_SuccessExecution_EmptyOutput() {
        val message = ""

        expectedException.expect(IllegalStateException::class.java)
        expectedException.expectMessage(message("sam.executable.empty_info"))

        val samPath = SamCommonTestUtils.makeATestSam(message).toString()
        SamVersionCache.getFileInfo(samPath)
    }

    private fun waitAll(promises: Collection<Promise<*>>) {
        val all = promises.all()
        all.blockingGet(3000)
    }
}
