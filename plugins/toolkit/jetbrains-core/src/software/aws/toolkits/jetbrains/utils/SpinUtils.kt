// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.utils

import kotlinx.coroutines.delay
import kotlinx.coroutines.runBlocking
import java.time.Duration
import java.util.concurrent.TimeoutException
import java.util.concurrent.atomic.AtomicReference

/**
 * Keeps checking the condition until the max duration as been reached. Checks every 100ms
 */
fun spinUntil(duration: Duration, interval: Duration = Duration.ofMillis(100), condition: () -> Boolean) {
    val start = System.nanoTime()
    runBlocking {
        while (!condition()) {
            if (System.nanoTime() - start > duration.toNanos()) {
                throw TimeoutException("Condition not reached within $duration")
            }
            delay(interval.toMillis())
        }
    }
}

/**
 * Keeps checking the block until the max duration as been reached or a non-null value has been returned. Checks every 100ms
 */
fun <T> spinUntilValue(duration: Duration, interval: Duration = Duration.ofMillis(100), block: () -> T?): T {
    val ref = AtomicReference<T>()
    spinUntil(duration, interval) {
        val value = block()
        if (value == null) {
            return@spinUntil false
        } else {
            ref.set(value)
            return@spinUntil true
        }
    }
    return ref.get()
}
