// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.tools

import org.assertj.core.api.Assertions.assertThat
import org.junit.Test
import software.aws.toolkits.jetbrains.utils.isInstanceOf
import software.aws.toolkits.jetbrains.utils.isInstanceOfSatisfying

class VersionsTest {
    private val testRange = VersionRange(IntegerVersion(10), IntegerVersion(12))

    @Test
    fun `no version range means any version is compatible`() {
        assertThat(IntegerVersion(4).isValid(null)).isInstanceOf<Validity.Valid>()
    }

    @Test
    fun `version below min version returns VersionTooOld`() {
        assertThat(
            IntegerVersion(4).isValid(testRange)
        ).isInstanceOfSatisfying<Validity.VersionTooOld> {
            assertThat(it.minVersion).isEqualTo(testRange.minVersion)
        }
    }

    @Test
    fun `version above max version returns VersionTooNew`() {
        assertThat(
            IntegerVersion(40).isValid(testRange)
        ).isInstanceOfSatisfying<Validity.VersionTooNew> {
            assertThat(it.maxVersion).isEqualTo(testRange.maxVersion)
        }
    }

    @Test
    fun `version in range is valid`() {
        assertThat(IntegerVersion(11).isValid(testRange)).isInstanceOf<Validity.Valid>()
    }

    @Test
    fun `minVersion is inclusive`() {
        assertThat(IntegerVersion(10).isValid(testRange)).isInstanceOf<Validity.Valid>()
    }

    @Test
    fun `maxVersion is exclusive`() {
        assertThat(IntegerVersion(12).isValid(testRange)).isInstanceOf(Validity.VersionTooNew::class.java)
    }

    data class IntegerVersion(val version: Int) : Version {
        override fun displayValue(): String = version.toString()
        override fun compareTo(other: Version): Int = version.compareTo((other as IntegerVersion).version)
    }
}
