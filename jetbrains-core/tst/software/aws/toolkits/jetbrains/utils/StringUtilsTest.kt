// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.utils

import org.assertj.core.api.Assertions.assertThat
import org.junit.Test
import software.aws.toolkits.core.utils.splitNoBlank

class StringUtilsTest {
    @Test
    fun splitNoBlank() {
        assertThat("a\nb\nc\n".split('\n')).isEqualTo(listOf("a", "b", "c", ""))
        assertThat("a\nb\nc\n".splitNoBlank('\n')).isEqualTo(listOf("a", "b", "c"))
        assertThat("a\nb\nc".splitNoBlank('\n')).isEqualTo(listOf("a", "b", "c"))
        assertThat("a\nb\nc\n   ".splitNoBlank('\n')).isEqualTo(listOf("a", "b", "c"))
        assertThat("a\nb\nc\n   \n".splitNoBlank('\n')).isEqualTo(listOf("a", "b", "c"))
    }
}
