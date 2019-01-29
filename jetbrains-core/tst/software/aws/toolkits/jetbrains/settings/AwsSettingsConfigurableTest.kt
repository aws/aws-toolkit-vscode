// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.settings

import com.intellij.openapi.options.ConfigurationException
import com.intellij.testFramework.ProjectRule
import org.junit.Assert.assertNotNull
import org.junit.Rule
import org.junit.Test
import org.junit.rules.ExpectedException
import software.aws.toolkits.jetbrains.services.lambda.execution.sam.SamCommonTestUtils
import java.nio.file.Path

class AwsSettingsConfigurableTest : SamExecutableDetectorTestBase() {
    @JvmField
    @Rule
    val projectRule = ProjectRule()

    @JvmField
    @Rule
    val expectedException: ExpectedException = ExpectedException.none()

    @Test
    fun validate_ok_noOp() {
        val settings = AwsSettingsConfigurable(projectRule.project)
        settings.apply(detector)
    }

    @Test
    fun validate_ok_changedSettingsWithNoSam() {
        val settings = AwsSettingsConfigurable(projectRule.project)
        // explicit call to suppress compiling error
        settings.samExecutablePath.setText(null)
        settings.enableTelemetry.isSelected = true
        settings.apply(detector)
        settings.enableTelemetry.isSelected = false
        settings.apply(detector)
    }

    @Test(expected = ConfigurationException::class)
    fun validate_fail_setBadSam() {
        val settings = AwsSettingsConfigurable(projectRule.project)
        settings.samExecutablePath.text = "not_a_valid_path"
        settings.apply(detector)
    }

    @Test
    fun validate_ok_setValidSam() {
        val samPath = makeASam(SamCommonTestUtils.getMinVersionAsJson())

        val settings = AwsSettingsConfigurable(projectRule.project)
        settings.samExecutablePath.text = samPath.toString()
        settings.apply(detector)
    }

    @Test
    fun validate_ok_autodetectBadSam() {
        // allow users to save if their autodetected sam executable is bad
        makeASam(SamCommonTestUtils.getMaxVersionAsJson())

        val settings = AwsSettingsConfigurable(projectRule.project)
        assertNotNull(detector.detect())
        settings.apply(detector)
    }

    @Test
    fun validate_fail_autodetectBadSam_andManuallySetToBadSam() {
        val sam = makeASam(SamCommonTestUtils.getMaxVersionAsJson())
        val settings = AwsSettingsConfigurable(projectRule.project)
        assertNotNull(detector.detect())
        settings.apply(detector)

        // use a rule instead of the annotation to ensure that test passes
        // only if exception is thrown on the second invocation of `apply`
        settings.samExecutablePath.text = sam.toAbsolutePath().toString()
        expectedException.expect(ConfigurationException::class.java)
        settings.apply(detector)
    }

    @Test
    fun validate_ok_autodetectValidSam() {
        makeASam(SamCommonTestUtils.getMinVersionAsJson())

        val settings = AwsSettingsConfigurable(projectRule.project)
        assertNotNull(detector.detect())
        settings.apply(detector)
    }

    private fun makeASam(version: String): Path {
        val path = "/usr/local/bin/sam"
        val actualPath = touch(path)

        return SamCommonTestUtils.makeATestSam(path = actualPath, message = version)
    }
}