// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.settings

import com.intellij.openapi.options.ConfigurationException
import com.intellij.openapi.util.SystemInfo
import com.intellij.testFramework.ProjectRule
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.Rule
import org.junit.Test
import software.aws.toolkits.jetbrains.services.lambda.sam.SamCommonTestUtils
import java.nio.file.Path

// TODO add PSE tests that makeAPse once we know where we want to put it and have a real PSE ExecutableManager
class AwsSettingsConfigurableTest : ExecutableDetectorTestBase() {
    @JvmField
    @Rule
    val projectRule = ProjectRule()

    @Test
    fun validate_ok_noOp() {
        val settings = ToolkitSettingsConfigurable()
        settings.apply()
    }

    @Test
    fun validate_ok_changedTelemetry() {
        val settings = AwsSettingsSharedConfigurable()
        settings.enableTelemetry.isSelected = true
        settings.apply()
        settings.enableTelemetry.isSelected = false
        settings.apply()
    }

    @Test
    fun validate_ok_setSamEmpty() {
        val settings = ToolkitSettingsConfigurable()
        settings.samExecutablePath.setText("")
        settings.apply()
    }

    @Test(expected = ConfigurationException::class)
    fun validate_fail_setBadSam() {
        val settings = ToolkitSettingsConfigurable()
        settings.samExecutablePath.text = "not_a_valid_path"
        settings.apply()
    }

    @Test
    fun validate_ok_setValidSam() {
        val samPath = makeASam(SamCommonTestUtils.getMinVersionAsJson())

        val settings = ToolkitSettingsConfigurable()
        settings.samExecutablePath.text = samPath.toString()
        settings.apply()
    }

    @Test
    fun validate_ok_autodetectBadSam() {
        // allow users to save if their autodetected sam executable is bad
        makeASam(SamCommonTestUtils.getMaxVersionAsJson())

        val settings = ToolkitSettingsConfigurable()
        settings.apply()
    }

    @Test
    fun validate_fail_autodetectBadSam_andManuallySetToBadSam() {
        val sam = makeASam(SamCommonTestUtils.getMaxVersionAsJson())
        val settings = ToolkitSettingsConfigurable()
        settings.apply()

        settings.samExecutablePath.text = sam.toAbsolutePath().toString()
        assertThatThrownBy {
            settings.apply()
        }.isInstanceOf(ConfigurationException::class.java)
    }

    @Test
    fun validate_ok_autodetectValidSam() {
        makeASam(SamCommonTestUtils.getMinVersionAsJson())

        val settings = ToolkitSettingsConfigurable()
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
