// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.tools

data class SemanticVersion(val major: Int, val minor: Int, val patch: Int) : Version {
    override fun displayValue(): String = "$major.$minor.$patch"

    override fun compareTo(other: Version): Int = COMPARATOR.compare(this, other as SemanticVersion)

    companion object {
        // TODO: Support pre-release
        private val COMPARATOR = compareBy<SemanticVersion> { it.major }
            .thenBy { it.minor }
            .thenBy { it.patch }

        fun parse(version: String): SemanticVersion {
            val parts = version.split(".")
            if (parts.size != 3) {
                throw IllegalArgumentException("[$version] not in the format of MAJOR.MINOR.PATCH")
            }

            try {
                val preReleaseStart = parts[2].indexOfFirst { it == '+' || it == '-' }
                val patchStr = if (preReleaseStart >= 0) {
                    parts[2].substring(0, preReleaseStart)
                } else {
                    parts[2]
                }

                return SemanticVersion(parts[0].toInt(), parts[1].toInt(), patchStr.toInt())
            } catch (e: Exception) {
                throw IllegalArgumentException("[$version] could not be parsed", e)
            }
        }
    }
}
