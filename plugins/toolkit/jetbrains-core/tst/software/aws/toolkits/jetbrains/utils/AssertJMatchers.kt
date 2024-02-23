// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.utils

import org.assertj.core.api.AbstractAssert
import org.assertj.core.api.AbstractThrowableAssert
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.CompletableFutureAssert
import java.time.Duration
import java.util.concurrent.CompletionStage
import java.util.concurrent.TimeUnit
import java.util.function.Consumer

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

fun <SELF : AbstractThrowableAssert<SELF, ACTUAL>, ACTUAL : Throwable> AbstractThrowableAssert<SELF, ACTUAL>.hasCauseWithMessage(
    message: String
): AbstractThrowableAssert<SELF, ACTUAL> {
    satisfies { parentThrowable ->
        assertThat(parentThrowable.cause).isNotNull.hasMessage(message)
    }
    return this
}

inline fun <reified T> AbstractAssert<*, *>.isInstanceOf() = isInstanceOf(T::class.java)
inline fun <reified T> AbstractAssert<*, *>.isInstanceOfSatisfying(checker: Consumer<T>) = isInstanceOfSatisfying(T::class.java, checker)
