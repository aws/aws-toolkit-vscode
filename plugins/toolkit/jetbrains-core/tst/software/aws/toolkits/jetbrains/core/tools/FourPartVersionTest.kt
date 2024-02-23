// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.tools

import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.Test
import software.aws.toolkits.jetbrains.utils.isInstanceOf

class FourPartVersionTest {
    @Test
    fun `versions can be compared`() {
        val base = FourPartVersion(1, 2, 3, 4)

        assertThat(base).isLessThan(FourPartVersion(1, 2, 3, 5))
        assertThat(base).isLessThan(FourPartVersion(1, 2, 4, 4))
        assertThat(base).isLessThan(FourPartVersion(1, 3, 3, 4))
        assertThat(base).isLessThan(FourPartVersion(2, 2, 3, 4))

        assertThat(base).isEqualTo(FourPartVersion(1, 2, 3, 4))

        assertThat(base).isGreaterThan(FourPartVersion(1, 2, 3, 3))
        assertThat(base).isGreaterThan(FourPartVersion(1, 2, 2, 4))
        assertThat(base).isGreaterThan(FourPartVersion(1, 1, 3, 4))
        assertThat(base).isGreaterThan(FourPartVersion(0, 2, 3, 4))
    }

    @Test
    fun `display name is human readable`() {
        assertThat(FourPartVersion(1, 2, 3, 4).displayValue()).isEqualTo("1.2.3.4")
    }

    @Test
    fun `parts are correct`() {
        assertThat(FourPartVersion(1, 2, 3, 4)).satisfies {
            assertThat(it.major).isEqualTo(1)
            assertThat(it.minor).isEqualTo(2)
            assertThat(it.patch).isEqualTo(3)
            assertThat(it.build).isEqualTo(4)
        }
    }

    @Test
    fun `versions are parsed correctly`() {
        assertThatThrownBy { FourPartVersion.parse("") }.isInstanceOf<IllegalArgumentException>()
        assertThatThrownBy { FourPartVersion.parse("1") }.isInstanceOf<IllegalArgumentException>()
        assertThatThrownBy { FourPartVersion.parse("1.") }.isInstanceOf<IllegalArgumentException>()
        assertThatThrownBy { FourPartVersion.parse("1.2") }.isInstanceOf<IllegalArgumentException>()
        assertThatThrownBy { FourPartVersion.parse("1.2.") }.isInstanceOf<IllegalArgumentException>()
        assertThatThrownBy { FourPartVersion.parse("1.2.") }.isInstanceOf<IllegalArgumentException>()
        assertThatThrownBy { FourPartVersion.parse("1.2.3") }.isInstanceOf<IllegalArgumentException>()
        assertThatThrownBy { FourPartVersion.parse("1.2.3.") }.isInstanceOf<IllegalArgumentException>()
        assertThat(FourPartVersion.parse("1.2.3.4")).isEqualTo(FourPartVersion(1, 2, 3, 4))
        assertThat(FourPartVersion.parse("10.20.30.40")).isEqualTo(FourPartVersion(10, 20, 30, 40))
        assertThatThrownBy { FourPartVersion.parse("1.2.3.4.") }.isInstanceOf<IllegalArgumentException>()
        assertThatThrownBy { FourPartVersion.parse("1.2.3.4.5") }.isInstanceOf<IllegalArgumentException>()

        assertThatThrownBy { FourPartVersion.parse("...") }.isInstanceOf<IllegalArgumentException>()
    }
}
