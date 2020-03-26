// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.core.utils

import com.nhaarman.mockitokotlin2.any
import com.nhaarman.mockitokotlin2.eq
import com.nhaarman.mockitokotlin2.mock
import com.nhaarman.mockitokotlin2.reset
import com.nhaarman.mockitokotlin2.verify
import com.nhaarman.mockitokotlin2.verifyZeroInteractions
import com.nhaarman.mockitokotlin2.whenever
import org.hamcrest.CoreMatchers.equalTo
import org.hamcrest.MatcherAssert.assertThat
import org.junit.Before
import org.junit.Test
import org.slf4j.Logger
import org.slf4j.event.Level

class LogUtilsTest {

    private val log = mock<Logger>()

    @Test
    fun exceptionIsLoggedAndSuppressedInTryOrNull() {
        val expectedException = RuntimeException("Boom")
        val result = log.tryOrNull("message", level = Level.WARN) { throw expectedException }

        verify(log).warn(any(), eq(expectedException))
        assertThat(result, equalTo(null))
    }

    @Test
    fun exceptionIsLoggedAndBubbledInTryOrThrowNullable() {
        val expectedException = RuntimeException("Boom")
        val exception = catch { log.tryOrThrowNullable("message") { throw expectedException } }
        verify(log).error(any(), eq(expectedException))
        assertThat(exception === expectedException, equalTo(true))
    }

    @Test
    fun exceptionIsLoggedAndBubbledInTryOrThrow() {
        val expectedException = RuntimeException("Boom")
        val exception = catch { log.tryOrThrow<Unit>("message") { throw expectedException } }
        verify(log).error(any(), eq(expectedException))
        assertThat(exception === expectedException, equalTo(true))
    }

    @Test
    fun nullableIsNotOkInTryOrThrow() {
        val exception = catch { log.tryOrThrow("message") { mightBeNull(shouldBeNull = true) } }
        verify(log).error(any(), eq(exception))
    }

    @Test
    fun smartCastToNonNullOnTryOrThrow() {
        val nullableValue: String = log.tryOrThrow("message") { mightBeNull(shouldBeNull = false) }
        val nonNullableValue: String = log.tryOrThrow("message") { willNeverBeNull() }
        assertThat(nullableValue, equalTo(nonNullableValue))
    }

    @Test
    fun nullableIsOkInTryOrThrowNullable() {
        log.tryOrThrowNullable("message") { null }
        verifyZeroInteractions(log)
    }

    @Test
    fun nullIsOkInTryOrNull() {
        log.tryOrNull("message") { null }
        verifyZeroInteractions(log)
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
        val result = log.logWhenNull("message", level = Level.WARN) { null }
        verify(log).warn("message", null)
        assertThat(result, equalTo(null))
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

    private fun willNeverBeNull(): String = "hello"
}
