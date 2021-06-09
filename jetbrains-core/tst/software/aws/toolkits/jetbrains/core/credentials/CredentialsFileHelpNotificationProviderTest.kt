// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials

import com.intellij.ide.util.PropertiesComponent
import com.intellij.openapi.application.impl.NonBlockingReadActionImpl
import com.intellij.openapi.fileEditor.FileEditor
import com.intellij.openapi.fileEditor.ex.FileEditorManagerEx
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.testFramework.EdtRule
import com.intellij.testFramework.PlatformTestUtil
import com.intellij.testFramework.RunsInEdt
import com.intellij.testFramework.runInEdtAndWait
import org.assertj.core.api.Assertions.assertThat
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import software.aws.toolkits.core.rules.SystemPropertyHelper
import software.aws.toolkits.jetbrains.core.credentials.CredentialsFileHelpNotificationProvider.CredentialFileNotificationPanel
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
    fun `notification not shown on credentials file when hidden forever`() {
        val propertiesComponent = PropertiesComponent.getInstance()
        val originalValue = propertiesComponent.getValue(CredentialsFileHelpNotificationProvider.DISABLE_KEY)
        try {
            val editor = openEditor(credentialsFile)
            getEditorNotifications(editor)!!.hideForever(credentialsFile, projectRule.project)

            assertThat(getEditorNotifications(editor)).isNull()

            closeEditor(credentialsFile)

            val newEditor = openEditor(credentialsFile)
            assertThat(getEditorNotifications(newEditor)).isNull()
        } finally {
            propertiesComponent.setValue(CredentialsFileHelpNotificationProvider.DISABLE_KEY, originalValue)
        }
    }

    @Test
    fun `notification gets hidden on dismiss`() {
        val editor = openEditor(credentialsFile)
        getEditorNotifications(editor)!!.dismiss(credentialsFile, projectRule.project, editor)

        assertThat(getEditorNotifications(editor)).isNull()

        closeEditor(credentialsFile)

        val newEditor = openEditor(credentialsFile)
        assertThat(getEditorNotifications(newEditor)).isNotNull
    }

    @Test
    fun `notification not shown on non credentials files`() {
        val editor = openEditor(projectRule.fixture.tempDirFixture.createFile("foo.txt"))
        assertThat(getEditorNotifications(editor)).isNull()
    }

    private fun openEditor(file: VirtualFile): FileEditor = FileEditorManagerEx.getInstanceEx(projectRule.project).openFile(file, true).single()

    private fun closeEditor(file: VirtualFile) {
        FileEditorManagerEx.getInstanceEx(projectRule.project).closeFile(file)
    }

    private fun getEditorNotifications(editor: FileEditor): CredentialFileNotificationPanel? {
        PlatformTestUtil.dispatchAllInvocationEventsInIdeEventQueue()
        NonBlockingReadActionImpl.waitForAsyncTaskCompletion()
        return editor.getUserData(CredentialsFileHelpNotificationProvider.KEY)
    }
}
