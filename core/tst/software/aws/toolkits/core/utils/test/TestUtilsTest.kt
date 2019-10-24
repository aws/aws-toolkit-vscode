// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.core.utils.test

import com.nhaarman.mockitokotlin2.mock
import com.nhaarman.mockitokotlin2.times
import com.nhaarman.mockitokotlin2.verify
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.Test
import java.time.Duration

class TestUtilsTest {

    @Test
    fun retryableAssertionErrorsBubbleAfterMaxDuration() {
        assertThatThrownBy {
            retryableAssert(timeout = Duration.ofMillis(50), interval = Duration.ofMillis(5)) {
                throw AssertionError("Boom")
            }
        }.isInstanceOf(AssertionError::class.java)
    }

    @Test
    fun nonAssertionErrorsBubbleImmediately() {
        val mock = mock<Runnable> {
            on { run() }.thenThrow(RuntimeException("Boom"))
        }
        assertThatThrownBy {
            retryableAssert(maxAttempts = 3, interval = Duration.ofMillis(5)) {
                mock.run()
            }
        }.isInstanceOf(RuntimeException::class.java)
        verify(mock, times(1)).run()
    }
}
