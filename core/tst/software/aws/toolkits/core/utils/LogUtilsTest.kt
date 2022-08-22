// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

@file:Suppress("LazyLog")
package software.aws.toolkits.core.utils

import org.assertj.core.api.Assertions.assertThat
import org.junit.Before
import org.junit.Test
import org.mockito.kotlin.any
import org.mockito.kotlin.eq
import org.mockito.kotlin.mock
import org.mockito.kotlin.reset
import org.mockito.kotlin.verify
import org.mockito.kotlin.verifyNoMoreInteractions
import org.mockito.kotlin.whenever
import org.slf4j.Logger
import org.slf4j.event.Level

class LogUtilsTest {

    private val log = mock<Logger>()

    @Test
    fun exceptionIsLoggedAndSuppressedInTryOrNull() {
        val expectedException = RuntimeException("Boom")
        log.tryOrNull("message", level = Level.WARN) { throw expectedException }
        verify(log).warn(any(), eq(expectedException))
    }

    @Test
    fun exceptionIsLoggedAndBubbledInTryOrThrowNullable() {
        val expectedException = RuntimeException("Boom")
        val exception = catch { log.tryOrThrowNullable("message") { throw expectedException } }
        verify(log).error(any(), eq(expectedException))
        assertThat(exception).isEqualTo(expectedException)
    }

    @Test
    fun exceptionIsLoggedAndBubbledInTryOrThrow() {
        val expectedException = RuntimeException("Boom")
        val exception = catch { log.tryOrThrow<Unit>("message") { throw expectedException } }
        verify(log).error(any(), eq(expectedException))
        assertThat(exception).isEqualTo(expectedException)
    }

    @Test
    fun nullableIsNotOkInTryOrThrow() {
        val exception = catch { log.tryOrThrow<String?>("message") { mightBeNull(shouldBeNull = true) } }
        verify(log).error(any(), eq(exception))
    }

    @Test
    fun smartCastToNonNullOnTryOrThrow() {
        val nullableValue: String = log.tryOrThrow("message") { mightBeNull(shouldBeNull = false) }
        val nonNullableValue: String = log.tryOrThrow("message") { willNeverBeNull() }
        assertThat(nullableValue).isEqualTo(nonNullableValue)
    }

    @Test
    fun nullableIsOkInTryOrThrowNullable() {
        log.tryOrThrowNullable("message") { null }
        verifyNoMoreInteractions(log)
    }

    @Test
    fun nullIsOkInTryOrNull() {
        log.tryOrNull("message") { null }
        verifyNoMoreInteractions(log)
    }

    @Test
    fun conditionalLazyLoggingInfo() {
        val exception = RuntimeException("Boom")

        log.info(exception) { "message" }

        whenever(log.isInfoEnabled).thenReturn(false)
        log.info(exception) { "message" }

        verify(log).info("message", exception)
    }

    @Test
    fun conditionalLazyLoggingDebug() {
        val exception = RuntimeException("Boom")

        log.debug(exception) { "message" }

        whenever(log.isDebugEnabled).thenReturn(false)
        log.debug(exception) { "message" }

        verify(log).debug("message", exception)
    }

    @Test
    fun conditionalLazyLoggingWarn() {
        val exception = RuntimeException("Boom")

        log.warn(exception) { "message" }

        whenever(log.isWarnEnabled).thenReturn(false)
        log.warn(exception) { "message" }

        verify(log).warn("message", exception)
    }

    @Test
    fun conditionalLazyLoggingError() {
        val exception = RuntimeException("Boom")

        log.error(exception) { "message" }

        whenever(log.isErrorEnabled).thenReturn(false)
        log.error(exception) { "message" }

        verify(log).error("message", exception)
    }

    @Test
    fun conditionalLazyLoggingTrace() {
        val exception = RuntimeException("Boom")

        log.trace(exception) { "message" }

        whenever(log.isTraceEnabled).thenReturn(false)
        log.trace(exception) { "message" }

        verify(log).trace("message", exception)
    }

    @Test
    fun canLogAtDifferentLevels() {
        val exception = RuntimeException("Boom")

        log.log(Level.TRACE) { "trace" }
        log.log(Level.INFO) { "info" }
        log.log(Level.ERROR, exception = exception) { "error" }
        log.log(Level.WARN) { "warn" }
        log.log(Level.DEBUG) { "debug" }

        verify(log).trace("trace", null)
        verify(log).info("info", null)
        verify(log).error("error", exception)
        verify(log).warn("warn", null)
        verify(log).debug("debug", null)
    }

    @Test
    fun logWhenNull() {
        log.logWhenNull("message", level = Level.WARN) { null }
        verify(log).warn("message", null)
    }

    @Before
    fun setup() {
        reset(log)
        whenever(log.isInfoEnabled).thenReturn(true)
        whenever(log.isWarnEnabled).thenReturn(true)
        whenever(log.isTraceEnabled).thenReturn(true)
        whenever(log.isErrorEnabled).thenReturn(true)
        whenever(log.isDebugEnabled).thenReturn(true)
    }

    private fun catch(block: () -> Unit): Exception = try {
        block()
        throw AssertionError("Expected exception")
    } catch (e: Exception) {
        e
    }

    private fun mightBeNull(shouldBeNull: Boolean): String? = if (shouldBeNull) {
        null
    } else {
        "hello"
    }

    @Suppress("FunctionOnlyReturningConstant")
    private fun willNeverBeNull(): String = "hello"
}
