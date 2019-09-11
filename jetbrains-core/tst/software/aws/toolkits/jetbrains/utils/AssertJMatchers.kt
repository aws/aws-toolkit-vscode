// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.utils

import org.assertj.core.api.AbstractAssert
import org.assertj.core.api.CompletableFutureAssert
import java.time.Duration
import java.util.concurrent.CompletionStage
import java.util.concurrent.TimeUnit

private val TIMEOUT = Duration.ofSeconds(1)

fun <T> CompletableFutureAssert<T>.wait(): CompletableFutureAssert<T> {
    try {
        matches { it.get(TIMEOUT.toMillis(), TimeUnit.MILLISECONDS) != null }
    } catch (e: Exception) {
        // suppress
    }
    return this
}

fun <T> CompletableFutureAssert<T>.hasValue(value: T) {
    wait().isCompletedWithValue(value)
}

val <T> CompletionStage<T>.value get() = toCompletableFuture().get(TIMEOUT.toMillis(), TimeUnit.MILLISECONDS)

val <T> CompletableFutureAssert<T>.hasException get() = this.wait().isCompletedExceptionally

inline fun <reified T> AbstractAssert<*, *>.isInstanceOf() = isInstanceOf(T::class.java)
