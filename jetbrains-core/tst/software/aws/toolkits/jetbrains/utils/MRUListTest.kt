// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.utils

import org.assertj.core.api.Assertions.assertThat
import org.junit.Before
import org.junit.Test

class MRUListTest {
    private lateinit var list: MRUList<String>

    @Before
    fun setUp() {
        list = MRUList(3)
    }

    @Test
    fun testEvictionOfOldest() {
        list.add(FOO)
        list.add(BAR)
        list.add(BAZ)
        list.add(FIZ)

        assertThat(list.elements()).containsExactly(FIZ, BAZ, BAR)
    }

    @Test
    fun testReAddingMovesUp() {
        list.add(FOO)
        list.add(BAR)
        list.add(BAZ)
        list.add(FOO)

        assertThat(list.elements()).containsExactly(FOO, BAZ, BAR)
    }

    private companion object {
        const val FOO = "Foo"
        const val BAR = "Bar"
        const val BAZ = "Baz"
        const val FIZ = "Fiz"
    }
}
