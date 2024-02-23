// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.core.utils

import org.assertj.core.api.Assertions.assertThat
import org.junit.Test

class ExceptionUtilsTest {
    @Test
    fun exceptionsAreNotBubbled() {
        @Suppress("DIVISION_BY_ZERO")
        val result = tryOrNull { 1 / 0 }
        assertThat(result).isNull()
    }
}
