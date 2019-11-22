// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.settings

import com.intellij.openapi.options.ConfigurationException
import com.intellij.openapi.util.SystemInfo
import com.intellij.testFramework.ProjectRule
import org.junit.Assume
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.rules.ExpectedException
import software.aws.toolkits.jetbrains.services.lambda.sam.SamCommonTestUtils
import java.nio.file.Path

// TODO add PSE tests that makeAPse once we know where we want to put it and have a real PSE ExecutableManager
class AwsSettingsConfigurableTest : ExecutableDetectorTestBase() {
    @JvmField
    @Rule
    val projectRule = ProjectRule()

    @JvmField
    @Rule
    val expectedException: ExpectedException = ExpectedException.none()

    @Before
    override fun setUp() {
        // TODO: Make the tests work on Windows
        Assume.assumeFalse(SystemInfo.isWindows)

        super.setUp()
    }

    @Test
    fun validate_ok_noOp() {
        val settings = AwsSettingsConfigurable(projectRule.project)
        settings.apply()
    }

    @Test
    fun validate_ok_changedTelemetry() {
        val settings = AwsSettingsConfigurable(projectRule.project)
        // explicit call to suppress compiling error
        settings.samExecutablePath.setText(null)
        settings.cloudDebugExecutablePath.setText(null)
        settings.enableTelemetry.isSelected = true
        settings.apply()
        settings.enableTelemetry.isSelected = false
        settings.apply()
    }

    @Test
    fun validate_ok_setSamEmpty() {
        val settings = AwsSettingsConfigurable(projectRule.project)
        settings.samExecutablePath.setText("")
        settings.apply()
    }

    @Test(expected = ConfigurationException::class)
    fun validate_fail_setBadSam() {
        val settings = AwsSettingsConfigurable(projectRule.project)
        settings.samExecutablePath.text = "not_a_valid_path"
        settings.apply()
    }

    @Test
    fun validate_ok_setValidSam() {
        val samPath = makeASam(SamCommonTestUtils.getMinVersionAsJson())

        val settings = AwsSettingsConfigurable(projectRule.project)
        settings.samExecutablePath.text = samPath.toString()
        settings.apply()
    }

    @Test
    fun validate_ok_autodetectBadSam() {
        // allow users to save if their autodetected sam executable is bad
        makeASam(SamCommonTestUtils.getMaxVersionAsJson())

        val settings = AwsSettingsConfigurable(projectRule.project)
        settings.apply()
    }

    @Test
    fun validate_fail_autodetectBadSam_andManuallySetToBadSam() {
        val sam = makeASam(SamCommonTestUtils.getMaxVersionAsJson())
        val settings = AwsSettingsConfigurable(projectRule.project)
        settings.apply()

        // use a rule instead of the annotation to ensure that test passes
        // only if exception is thrown on the second invocation of `apply`
        settings.samExecutablePath.text = sam.toAbsolutePath().toString()
        expectedException.expect(ConfigurationException::class.java)
        settings.apply()
    }

    @Test
    fun validate_ok_autodetectValidSam() {
        makeASam(SamCommonTestUtils.getMinVersionAsJson())

        val settings = AwsSettingsConfigurable(projectRule.project)
        settings.apply()
    }

    private fun makeASam(version: String): Path {
        val path = if (SystemInfo.isWindows) {
            "C:\\Program Files (x86)\\Amazon\\AWSSAMCLI\\bin\\sam.bat"
        } else {
            "/usr/local/bin/sam"
        }

        val actualPath = touch(path).absolutePath

        return SamCommonTestUtils.makeATestSam(path = actualPath, message = version)
    }
}
