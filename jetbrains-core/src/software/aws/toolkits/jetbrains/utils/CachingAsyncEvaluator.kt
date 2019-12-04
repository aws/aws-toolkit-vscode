// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.utils

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.progress.ProcessCanceledException
import org.jetbrains.annotations.TestOnly
import org.jetbrains.concurrency.AsyncPromise
import org.jetbrains.concurrency.Promise
import org.jetbrains.concurrency.isPending
import org.slf4j.Logger
import org.slf4j.LoggerFactory
import software.aws.toolkits.core.utils.info
import java.util.concurrent.TimeUnit

abstract class CachingAsyncEvaluator<TEntry, TReturn> {

    companion object {
        private const val EVALUATE_BLOCKING_TIMEOUT_MS = 1000
    }

    private val logger: Logger = LoggerFactory.getLogger(this::class.java)
    private val requests = hashMapOf<TEntry, Promise<TReturn>>()
    private val lock = Object()

    /**
     * @return A promise for the requested file info. Promise will be resolved when the info is ready.
     */
    fun evaluate(entry: TEntry): Promise<TReturn> {
        logger.info { "Evaluating $entry" }

        val asyncPromise = AsyncPromise<TReturn>()
        asyncPromise
            .onSuccess { result ->
                logger.info { "File info evaluation is completed: '$result'" }
            }
            .onError { error ->
                // Need to set an error handler early, else the setError call will throw AssertionError
                if (error !is ProcessCanceledException) {
                    logger.info(error) { "Failed to evaluate $entry" }
                }
                clearRequest(entry)
            }

        val promise = synchronized(lock) {
            val cachePromise = requests.getOrPut(entry) { asyncPromise }
            if (!cachePromise.isPending && cachePromise.isSucceeded) {
                if (isInvalidated(entry, cachePromise.blockingGet(0)!!)) {
                    requests[entry] = asyncPromise
                    return@synchronized asyncPromise
                }
            }
            cachePromise
        }

        if (promise == asyncPromise) {
            ApplicationManager.getApplication().executeOnPooledThread {
                try {
                    val result = getValue(entry)
                    asyncPromise.setResult(result)
                } catch (t: Throwable) {
                    asyncPromise.setError(t)
                }
            }
        }

        return promise
    }

    abstract fun getValue(entry: TEntry): TReturn

    open fun isInvalidated(entry: TEntry, value: TReturn): Boolean = false

    fun evaluateBlocking(entry: TEntry, blockingTime: Int = EVALUATE_BLOCKING_TIMEOUT_MS, blockingUnit: TimeUnit = TimeUnit.MILLISECONDS): TReturn {
        val promise = evaluate(entry)
        return promise.blockingGet(blockingTime, blockingUnit)!!
    }

    @Suppress("unused")
    fun containsEntry(entry: TEntry): Boolean =
        synchronized(lock) {
            requests.containsKey(entry)
        }

    @Suppress("unused")
    fun cancelRequests() {
        synchronized(lock) {
            requests.forEach { request ->
                (request.value as? AsyncPromise)?.cancel()
            }
            requests.clear()
        }
    }

    fun clearRequests() {
        synchronized(lock) {
            requests.clear()
        }
    }

    private fun clearRequest(entry: TEntry) {
        synchronized(lock) {
            requests.remove(entry)
        }
    }

    @TestOnly
    fun testOnlyGetRequestCache() = requests
}
