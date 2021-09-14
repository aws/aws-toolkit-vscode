// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.tools

import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.Test
import software.aws.toolkits.jetbrains.utils.isInstanceOf

class SemanticVersionTest {
    @Test
    fun `versions can be compared`() {
        val base = SemanticVersion(1, 2, 3)

        assertThat(base).isLessThan(SemanticVersion(1, 2, 4))
        assertThat(base).isLessThan(SemanticVersion(1, 3, 3))
        assertThat(base).isLessThan(SemanticVersion(2, 2, 3))

        assertThat(base).isEqualTo(SemanticVersion(1, 2, 3))

        assertThat(base).isGreaterThan(SemanticVersion(1, 2, 2))
        assertThat(base).isGreaterThan(SemanticVersion(1, 1, 3))
        assertThat(base).isGreaterThan(SemanticVersion(0, 2, 3))
    }

    @Test
    fun `display name is human readable`() {
        assertThat(SemanticVersion(1, 2, 3).displayValue()).isEqualTo("1.2.3")
    }

    @Test
    fun `parts are correct`() {
        assertThat(SemanticVersion(1, 2, 3)).satisfies {
            assertThat(it.major).isEqualTo(1)
            assertThat(it.minor).isEqualTo(2)
            assertThat(it.patch).isEqualTo(3)
        }
    }

    @Test
    fun `versions are parsed correctly`() {
        assertThatThrownBy { SemanticVersion.parse("") }.isInstanceOf<IllegalArgumentException>()
        assertThatThrownBy { SemanticVersion.parse("1") }.isInstanceOf<IllegalArgumentException>()
        assertThatThrownBy { SemanticVersion.parse("1.") }.isInstanceOf<IllegalArgumentException>()
        assertThatThrownBy { SemanticVersion.parse("1.2") }.isInstanceOf<IllegalArgumentException>()
        assertThatThrownBy { SemanticVersion.parse("1.2.") }.isInstanceOf<IllegalArgumentException>()
        assertThatThrownBy { SemanticVersion.parse("1.2.") }.isInstanceOf<IllegalArgumentException>()
        assertThat(SemanticVersion.parse("1.2.3")).isEqualTo(SemanticVersion(1, 2, 3))
        assertThat(SemanticVersion.parse("10.20.30")).isEqualTo(SemanticVersion(10, 20, 30))
        assertThatThrownBy { SemanticVersion.parse("1.2.3.") }.isInstanceOf<IllegalArgumentException>()
        assertThatThrownBy { SemanticVersion.parse("1.2.3.4") }.isInstanceOf<IllegalArgumentException>()

        assertThatThrownBy { SemanticVersion.parse("..") }.isInstanceOf<IllegalArgumentException>()

        assertThat(SemanticVersion.parse("1.2.3-nightly")).isEqualTo(SemanticVersion(1, 2, 3))
        assertThat(SemanticVersion.parse("1.2.3+nightly")).isEqualTo(SemanticVersion(1, 2, 3))
        assertThat(SemanticVersion.parse("1.2.3-nightly-build")).isEqualTo(SemanticVersion(1, 2, 3))
        assertThat(SemanticVersion.parse("1.2.3-nightly+build")).isEqualTo(SemanticVersion(1, 2, 3))
        assertThat(SemanticVersion.parse("1.2.3+nightly-build")).isEqualTo(SemanticVersion(1, 2, 3))
        assertThat(SemanticVersion.parse("1.2.3+nightly+build")).isEqualTo(SemanticVersion(1, 2, 3))
    }
}
