// Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.core.utils

import org.slf4j.Logger
import org.slf4j.LoggerFactory

inline fun <reified T : Any> getLogger(): Logger = LoggerFactory.getLogger(T::class.java)

/**
 * Execute the given block and log any exception that occurs with the provided [message].
 */
fun <T> Logger.tryOrNull(message: String, block: () -> T?): T? = try {
    block()
} catch (e: Exception) {
    this.error(e) { message }
    null
}

/**
 * Execute the given block, log an error and then bubble any exception that occurs.
 *
 * A [block] that returns null bubbles an exception
 */
fun <T> Logger.tryOrThrow(message: String, block: () -> T?): T = try {
    block() ?: throw NullPointerException()
} catch (e: Exception) {
    this.error(e) { message }
    throw e
}

/**
 * Execute the given block, log an error and then bubble any exception that occurs.
 *
 * A [block] that returns null is legal
 */
fun <T> Logger.tryOrThrowNullable(message: String, block: () -> T?) = try {
    block()
} catch (e: Exception) {
    this.error(e) { message }
    throw e
}

fun Logger.debug(exception: Throwable? = null, block: () -> String) {
    if (isDebugEnabled) {
        debug(block(), exception)
    }
}

fun Logger.info(exception: Throwable? = null, block: () -> String) {
    if (isInfoEnabled) {
        info(block(), exception)
    }
}

fun Logger.error(exception: Throwable? = null, block: () -> String) {
    if (isErrorEnabled) {
        error(block(), exception)
    }
}

fun Logger.warn(exception: Throwable? = null, block: () -> String) {
    if (isWarnEnabled) {
        warn(block(), exception)
    }
}

fun Logger.trace(exception: Throwable? = null, block: () -> String) {
    if (isTraceEnabled) {
        trace(block(), exception)
    }
}