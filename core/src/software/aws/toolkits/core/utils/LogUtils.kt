// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.core.utils

import org.slf4j.Logger
import org.slf4j.LoggerFactory
import org.slf4j.event.Level
import kotlin.reflect.KClass

inline fun <reified T : Any> getLogger(): Logger = getLogger(T::class)
fun getLogger(clazz: KClass<*>): Logger = LoggerFactory.getLogger(clazz.java)

/**
 * Execute the given [block] and log any exception that occurs at the [level] with the provided [message].
 *
 * Defaults to [Level.ERROR] if none specified.
 */
fun <T> Logger.tryOrNull(message: String, level: Level = Level.ERROR, block: () -> T?): T? = try {
    block()
} catch (e: Exception) {
    log(level, e) { message }
    null
}

/**
 * Execute the given block, log at the given [level] and then bubble any exception that occurs.
 *
 * A [block] that returns null bubbles an exception
 */
fun <T> Logger.tryOrThrow(message: String, level: Level = Level.ERROR, block: () -> T?): T = try {
    block() ?: throw NullPointerException()
} catch (e: Exception) {
    log(level, e) { message }
    throw e
}

/**
 * Execute the given block, log an error and then bubble any exception that occurs.
 *
 * A [block] that returns null is legal
 */
fun <T> Logger.tryOrThrowNullable(message: String, level: Level = Level.ERROR, block: () -> T?) = try {
    block()
} catch (e: Exception) {
    log(level, e) { message }
    throw e
}

/**
 * Execute the given block and return the result. Log a warning when the result is null
 */
fun <T> Logger.logWhenNull(message: String, level: Level = Level.WARN, block: () -> T?): T? {
    val value = block()
    if (value == null) {
        log(level) { message }
    }
    return value
}

fun Logger.log(level: Level, exception: Throwable? = null, block: () -> String) {
    when (level) {
        Level.ERROR -> error(exception, block)
        Level.WARN -> warn(exception, block)
        Level.INFO -> info(exception, block)
        Level.DEBUG -> debug(exception, block)
        Level.TRACE -> trace(exception, block)
    }
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

fun Logger.assertTrue(value: Boolean, block: () -> String): Boolean {
    if (!value) {
        val resultMessage = "Assertion failed: ${block.invoke()}"
        error(resultMessage, Throwable(resultMessage))
    }

    return value
}
