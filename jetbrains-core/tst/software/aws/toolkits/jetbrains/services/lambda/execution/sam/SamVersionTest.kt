// Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.execution.sam

import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class SamVersionTest {
    @Test
    fun compatableSamVersion() {
        val versions = arrayOf(
            "SAM CLI, version 0.6.0",
            "SAM CLI, version 0.7.0",
            "SAM CLI, version 0.7.123",
            "SAM CLI, version 0.7.999999999",
            "SAM CLI, version 0.7.0-beta",
            "SAM CLI, version 0.7.0-beta+build"
        )
        for (version in versions) {
            assertNull(SamCommon.checkVersion(version))
        }
    }

    @Test
    fun unparsableVersion() {
        val versions = arrayOf(
            "GNU bash, version 3.2.57(1)-release (x86_64-apple-darwin16)",
            "GNU bash, version 3.2.57(1)-release",
            "12312312.123123131221"
        )
        for (version in versions) {
            val message = SamCommon.checkVersion(version)
            assertTrue(message != null && message.contains("Could not parse SAM executable version from"))
        }
    }

    @Test
    fun incompatableSamVersion_tooLow() {
        val versions = arrayOf(
                "SAM CLI, version 0.5.9",
                "SAM CLI, version 0.0.1",
                "SAM CLI, version 0.5.9-dev"
        )
        for (version in versions) {
            val message = SamCommon.checkVersion(version)
            assertTrue(message != null && message.contains("Bad SAM executable version. Expected"))
            assertTrue(message != null && message.contains("upgrade your SAM CLI"))
        }
    }

    @Test
    fun incompatableSamVersion_tooHigh() {
        val versions = arrayOf(
                "SAM CLI, version 0.8.0",
                "SAM CLI, version 1.0.0",
                "SAM CLI, version 1.5.9",
                "SAM CLI, version 1.5.9-dev"
        )
        for (version in versions) {
            val message = SamCommon.checkVersion(version)
            assertTrue(message != null && message.contains("Bad SAM executable version. Expected"))
            assertTrue(message != null && message.contains("upgrade your AWS Toolkit"))
        }
    }
}
