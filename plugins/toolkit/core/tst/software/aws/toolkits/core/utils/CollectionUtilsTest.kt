// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.core.utils

import org.assertj.core.api.Assertions.assertThat
import org.junit.Test

class CollectionUtilsTest {

    @Test
    fun `collection items are replaced`() {
        val source = mutableListOf("hello")

        source.replace(listOf("world"))

        assertThat(source).containsOnly("world")
    }

    @Test
    fun `map entries are replaced`() {
        val source = mutableMapOf("foo" to "bar")
        source.replace(mapOf("hello" to "world"))

        assertThat(source).containsOnlyKeys("hello")
    }
}
