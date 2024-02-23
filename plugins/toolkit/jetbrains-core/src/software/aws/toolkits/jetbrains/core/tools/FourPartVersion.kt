// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.tools

data class FourPartVersion(val major: Int, val minor: Int, val patch: Int, val build: Int) : Version {
    override fun displayValue(): String = "$major.$minor.$patch.$build"

    override fun compareTo(other: Version): Int = COMPARATOR.compare(this, other as FourPartVersion)

    companion object {
        private val COMPARATOR = compareBy<FourPartVersion> { it.major }
            .thenBy { it.minor }
            .thenBy { it.patch }
            .thenBy { it.build }

        fun parse(version: String): FourPartVersion {
            val parts = version.split(".")
            if (parts.size != 4) {
                throw IllegalArgumentException("[$version] not in the format of MAJOR.MINOR.PATCH.BUILD")
            }

            try {
                return FourPartVersion(parts[0].toInt(), parts[1].toInt(), parts[2].toInt(), parts[3].toInt())
            } catch (e: Exception) {
                throw IllegalArgumentException("[$version] could not be parsed", e)
            }
        }
    }
}
