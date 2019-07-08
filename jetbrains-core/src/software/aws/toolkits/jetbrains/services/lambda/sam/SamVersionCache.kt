// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.sam

import com.intellij.execution.process.CapturingProcessHandler
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.progress.ProcessCanceledException
import com.intellij.util.text.SemVer
import org.jetbrains.annotations.TestOnly
import org.jetbrains.concurrency.AsyncPromise
import org.jetbrains.concurrency.Promise
import software.aws.toolkits.core.utils.error
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.info
import software.aws.toolkits.jetbrains.utils.FileInfoCache
import software.aws.toolkits.resources.message

object SamVersionCache : FileInfoCache<SemVer>() {

    private val logger = getLogger<SamVersionCache>()
    private val versionRequests = hashMapOf<String, Promise<SemVer>>()
    private val lock = Object()

    override fun getFileInfo(path: String): SemVer {
        val commandLine = SamCommon.getSamCommandLine(path).withParameters("--info")
        val process = CapturingProcessHandler(commandLine).runProcess()

        if (process.exitCode != 0) {
            val output = process.stderr.trimEnd()
            if (output.contains(SamCommon.SAM_INVALID_OPTION_SUBSTRING)) {
                throw IllegalStateException(message("sam.executable.unexpected_output", output))
            }
            throw IllegalStateException(output)
        } else {
            val output = process.stdout.trimEnd()
            if (output.isEmpty()) {
                throw IllegalStateException(message("sam.executable.empty_info"))
            }
            val tree = SamCommon.mapper.readTree(output)
            val version = tree.get(SamCommon.SAM_INFO_VERSION_KEY).asText()
            return SemVer.parseFromText(version)
                ?: throw IllegalStateException(message("sam.executable.version_parse_error", version))
        }
    }

    fun evaluate(samExecutablePath: String): Promise<SemVer> {
        logger.info { "Evaluating SAM version string." }

        val asyncPromise = AsyncPromise<SemVer>()
        val promise = synchronized(lock) { versionRequests.getOrPut(samExecutablePath) { asyncPromise } }

        if (promise == asyncPromise) {
            ApplicationManager.getApplication().executeOnPooledThread {
                try {
                    val version = getFileInfo(samExecutablePath)
                    asyncPromise.setResult(version)
                } catch (t: Throwable) {
                    asyncPromise.setError(t)
                }
            }

            asyncPromise
                .onSuccess { version ->
                    logger.info { "SAM version evaluation is completed: '$version'" }
                }
                .onError { error ->
                    if (error !is ProcessCanceledException) {
                        logger.error(error) { "Failed to evaluate SAM version" }
                    }
                    clearCache(samExecutablePath)
                }
        }

        return promise
    }

    private fun clearCache(key: String) = synchronized(lock) { versionRequests.remove(key) }

    @TestOnly
    fun testOnlyGetRequestCache() = versionRequests
}
