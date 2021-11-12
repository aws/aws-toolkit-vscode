// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.tools

/**
 * Top level interface for different versioning schemes such as semantic version
 */
interface Version : Comparable<Version> {
    /**
     * @return Human-readable representation of the version
     */
    fun displayValue(): String
}

/**
 * @return true if the specified version is compatible with the specified version ranges. Always returns true if no range is specified.
 */
fun <T : Version> T.isValid(range: VersionRange<T>?): Validity = when {
    range == null -> Validity.Valid(this)
    this < range.minVersion -> Validity.VersionTooOld(this, range.minVersion)
    range.maxVersion <= this -> Validity.VersionTooNew(this, range.maxVersion)
    else -> Validity.Valid(this)
}

/**
 * Represents a range of versions.
 *
 * @property minVersion The minimum version supported, inclusive.
 * @property maxVersion The maximum version supported, exclusive.
 */
data class VersionRange<T : Version>(val minVersion: T, val maxVersion: T) {
    fun displayValue() = "${minVersion.displayValue()} ≤ X < ${maxVersion.displayValue()}"
}

infix fun <T : Version> T.until(that: T): VersionRange<T> = VersionRange(this, that)
