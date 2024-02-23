// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.core.utils

import org.assertj.core.api.Assertions.assertThat
import org.junit.Before
import org.junit.Test

class RuleUtilsTest {
    private lateinit var callingClass: String

    @Before
    fun setUp() {
        callingClass = RuleUtils.prefixFromCallingClass()
    }

    @Test
    fun `late init before works`() {
        assertThat(callingClass).isEqualTo("RuleUtilsTest")
    }

    @Test
    fun `inline works`() {
        assertThat(RuleUtils.prefixFromCallingClass()).isEqualTo("RuleUtilsTest")
    }
}
