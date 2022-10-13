// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials

import com.intellij.openapi.fileEditor.FileEditor
import com.intellij.openapi.fileEditor.ex.FileEditorManagerEx
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.testFramework.EdtRule
import com.intellij.testFramework.RunsInEdt
import com.intellij.testFramework.runInEdtAndWait
import org.assertj.core.api.Assertions.assertThat
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import software.aws.toolkits.core.rules.SystemPropertyHelper
import software.aws.toolkits.jetbrains.core.credentials.CredentialsFileHelpNotificationProvider.CredentialFileNotificationPanel
import software.aws.toolkits.jetbrains.core.getEditorNotifications
import software.aws.toolkits.jetbrains.utils.rules.HeavyJavaCodeInsightTestFixtureRule

@RunsInEdt
class CredentialsFileHelpNotificationProviderTest {
    @Rule
    @JvmField
    val projectRule = HeavyJavaCodeInsightTestFixtureRule()

    @Rule
    @JvmField
    val systemPropertyHelper = SystemPropertyHelper()

    @Rule
    @JvmField
    val temporaryFolder = TemporaryFolder()

    @Rule
    @JvmField
    val edtRule = EdtRule()

    private lateinit var configFile: VirtualFile
    private lateinit var credentialsFile: VirtualFile

    @Before
    fun setUp() {
        runInEdtAndWait {
            configFile = projectRule.fixture.tempDirFixture.createFile("config", "[default]")
            credentialsFile = projectRule.fixture.tempDirFixture.createFile("credentials", "[default]")
        }

        System.getProperties().setProperty("aws.configFile", configFile.toNioPath().toString())
        System.getProperties().setProperty("aws.sharedCredentialsFile", credentialsFile.toNioPath().toString())
    }

    @Test
    fun `notification gets shown on config file`() {
        val editor = openEditor(credentialsFile)
        assertThat(getEditorNotifications(editor)).isNotNull
    }

    @Test
    fun `notification gets shown on credentials file`() {
        val editor = openEditor(credentialsFile)
        assertThat(getEditorNotifications(editor)).isNotNull
    }

    @Test
    fun `notification not shown on non credentials files`() {
        val editor = openEditor(projectRule.fixture.tempDirFixture.createFile("foo.txt"))
        assertThat(getEditorNotifications(editor)).isNull()
    }

    private fun openEditor(file: VirtualFile): FileEditor = FileEditorManagerEx.getInstanceEx(projectRule.project).openFile(file, true).single()

    private fun getEditorNotifications(editor: FileEditor): CredentialFileNotificationPanel? =
        getEditorNotifications(projectRule.project, editor, CredentialsFileHelpNotificationProvider::class.java, CredentialsFileHelpNotificationProvider.KEY)
            as CredentialFileNotificationPanel?
}
