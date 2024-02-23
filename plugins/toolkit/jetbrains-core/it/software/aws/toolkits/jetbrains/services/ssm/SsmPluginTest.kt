// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.ssm

import com.intellij.openapi.util.SystemInfo
import com.intellij.testFramework.ApplicationRule
import com.intellij.util.io.HttpRequests
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.SoftAssertions
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.util.UUID

class SsmPluginTest {
    @Rule
    @JvmField
    val application = ApplicationRule()

    @Rule
    @JvmField
    val tempFolder = TemporaryFolder()

    @Test
    fun `download URLs all work`() {
        val latest = SsmPlugin.determineLatestVersion()
        SoftAssertions.assertSoftly { softly ->
            listOf(
                SsmPlugin.windowsUrl(latest),
                SsmPlugin.linuxArm64Url(latest),
                SsmPlugin.linuxI64Url(latest),
                SsmPlugin.ubuntuArm64Url(latest),
                SsmPlugin.ubuntuI64Url(latest),
                SsmPlugin.macUrl(latest)
            ).forEach { url ->
                softly.assertThatCode { HttpRequests.head(url).tryConnect() }.doesNotThrowAnyException()
            }
        }
    }

    @Test
    fun `end to end install works`() {
        val executableName = if (SystemInfo.isWindows) {
            "session-manager-plugin.exe"
        } else {
            "session-manager-plugin"
        }

        val latest = SsmPlugin.determineLatestVersion()
        val downloadDir = tempFolder.newFolder().toPath()
        val installDir = tempFolder.newFolder()
            .resolve("nested1-${UUID.randomUUID()}")
            .resolve("nested2-${UUID.randomUUID()}")
            .toPath()

        val downloadedFile = SsmPlugin.downloadVersion(latest, downloadDir, null)
        SsmPlugin.installVersion(downloadedFile, installDir, null)
        val tool = SsmPlugin.toTool(installDir)
        assertThat(tool.path.fileName.toString()).isEqualTo(executableName)

        val reportedLatest = SsmPlugin.determineVersion(tool.path)
        assertThat(reportedLatest).isEqualTo(latest)
    }
}
