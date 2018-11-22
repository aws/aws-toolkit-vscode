// Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.settings

import com.intellij.openapi.options.ConfigurationException
import com.intellij.openapi.util.SystemInfo
import com.intellij.testFramework.ProjectRule
import org.junit.Assert.assertNotNull
import org.junit.Assume
import org.junit.Rule
import org.junit.Test
import software.aws.toolkits.jetbrains.services.lambda.execution.sam.SamCommonTestUtils
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.Paths
import java.nio.file.attribute.PosixFilePermissions

fun setPathAsExecutable(path: Path) {
    Files.setPosixFilePermissions(path, PosixFilePermissions.fromString("r-xr-xr-x"))
}

class AwsSettingsConfigurableTest : SamExecutableDetectorTestBase() {
    @JvmField
    @Rule
    val projectRule = ProjectRule()

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
        Assume.assumeTrue(SystemInfo.isUnix)

        val sam = tempFolderRule.newFile().toPath()
        Files.write(sam, mutableListOf("echo '${SamCommonTestUtils.getMinVersionAsJson()}'"))
        setPathAsExecutable(sam)

        val settings = AwsSettingsConfigurable(projectRule.project)
        settings.samExecutablePath.text = sam.toString()
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
    fun validate_ok_autodetectValidSam() {
        makeASam(SamCommonTestUtils.getMinVersionAsJson())

        val settings = AwsSettingsConfigurable(projectRule.project)
        assertNotNull(detector.detect())
        settings.apply(detector)
    }

    private fun makeASam(version: String) {
        Assume.assumeTrue(SystemInfo.isUnix)
        val path = "/usr/local/bin/sam"
        touch(path)
        assertExecutable(path)

        val sam = Paths.get(tempFolder, path)
        Files.write(sam, mutableListOf("echo '$version'"))
        setPathAsExecutable(sam)
    }
}