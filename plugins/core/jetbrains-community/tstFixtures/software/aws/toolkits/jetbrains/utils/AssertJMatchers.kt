// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.utils

import org.assertj.core.api.AbstractAssert
import org.assertj.core.api.AbstractIterableAssert
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

// https://github.com/assertj/assertj/issues/2357
@Suppress("UNCHECKED_CAST")
fun <E : Any?, I : Iterable<E>> AbstractIterableAssert<*, I, E, *>.allSatisfyKt(requirements: Consumer<E>) =
    allSatisfy(requirements) as AbstractIterableAssert<*, I, E, *>

@Suppress("UNCHECKED_CAST")
fun <E : Any?, I : Iterable<E>> AbstractIterableAssert<*, I, E, *>.anySatisfyKt(requirements: Consumer<E>) =
    anySatisfy(requirements) as AbstractIterableAssert<*, I, E, *>

@Suppress("UNCHECKED_CAST")
fun <T : Any?> AbstractAssert<*, T>.satisfiesKt(requirements: Consumer<T>) =
    satisfies(requirements) as AbstractAssert<*, T>

fun <SELF : AbstractThrowableAssert<SELF, ACTUAL>, ACTUAL : Throwable> AbstractThrowableAssert<SELF, ACTUAL>.hasCauseWithMessage(
    message: String
): AbstractThrowableAssert<SELF, ACTUAL> {
    satisfiesKt { parentThrowable ->
        assertThat(parentThrowable.cause).isNotNull.hasMessage(message)
    }
    return this
}

inline fun <reified T> AbstractAssert<*, *>.isInstanceOf() = isInstanceOf(T::class.java)
inline fun <reified T> AbstractAssert<*, *>.isInstanceOfSatisfying(checker: Consumer<T>) = isInstanceOfSatisfying(T::class.java, checker)
