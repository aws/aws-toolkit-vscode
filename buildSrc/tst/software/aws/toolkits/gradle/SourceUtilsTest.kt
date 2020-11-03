// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.gradle

import org.assertj.core.api.Assertions.assertThat
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.Parameterized

@RunWith(Parameterized::class)
class SourceUtilsTest(private val folderName: String, private val expected: Boolean) {

    companion object {
        @JvmStatic
        @Parameterized.Parameters(name = "{0} -> {1}")
        fun data(): Collection<Array<Any>> = listOf(
            arrayOf("tst", true),
            arrayOf("tst-201", true),
            arrayOf("tst-190+", true),
            arrayOf("tst-201+", true),
            arrayOf("tst-201-202", true),
            arrayOf("tst-193-201", true),
            arrayOf("tst-193-202", true),

            arrayOf("tst-resources", false),
            arrayOf("tst-resources-201", false),
            arrayOf("tst-192", false),
            arrayOf("tst-202", false),
            arrayOf("tst-202+", false),
            arrayOf("src-201", false),
            arrayOf("random", false),
            arrayOf("src-tst", false),
            arrayOf("tst-192-193", false)
        )
    }

    @Test
    fun `correctly includes folder`() {
        assertThat(includeFolder("tst", "201", folderName)).isEqualTo(expected)
    }
}
