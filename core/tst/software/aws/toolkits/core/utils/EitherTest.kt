// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.core.utils

import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.Test

class EitherTest {
    @Test
    fun basicLeftFunctionality() {
        val result: Either<String, Int> = maybeString(false) xor maybeInt(true)
        assertThat(result).isInstanceOfSatisfying(Either.Left::class.java) {
            assertThat(it.value).isEqualTo("foo")
        }
    }

    @Test
    fun basicRightFunctionality() {
        val result: Either<String, Int> = maybeString(true) xor maybeInt(false)
        assertThat(result).isInstanceOfSatisfying(Either.Right::class.java) {
            assertThat(it.value).isEqualTo(50)
        }
    }

    @Test
    fun cantBothBeNonNull() {
        assertThatThrownBy { maybeString(false) xor maybeInt(false) }.isInstanceOf(IllegalArgumentException::class.java)
    }

    @Test
    fun cantBothBeNull() {
        assertThatThrownBy { maybeString(true) xor maybeInt(true) }.isInstanceOf(IllegalArgumentException::class.java)
    }

    private fun maybeString(isNull: Boolean): String? = if (isNull) null else "foo"
    private fun maybeInt(isNull: Boolean): Int? = if (isNull) null else 50
}
