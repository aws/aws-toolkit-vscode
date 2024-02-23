// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.fileTypes.FileTypes
import com.intellij.openapi.fileTypes.ex.FileTypeManagerEx
import com.intellij.openapi.ui.TestDialog
import com.intellij.openapi.ui.TestDialogManager
import com.intellij.openapi.vfs.LocalFileSystem
import com.intellij.testFramework.ProjectRule
import com.intellij.testFramework.TestActionEvent
import com.intellij.testFramework.runInEdtAndWait
import org.assertj.core.api.Assertions.assertThat
import org.junit.After
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import org.mockito.kotlin.atLeastOnce
import org.mockito.kotlin.doAnswer
import org.mockito.kotlin.mock
import org.mockito.kotlin.verify
import org.mockito.kotlin.verifyNoMoreInteractions
import java.io.File

class CreateOrUpdateCredentialProfilesActionTest {

    @Rule
    @JvmField
    val folderRule = TemporaryFolder()

    @Rule
    @JvmField
    val projectRule = ProjectRule()

    private lateinit var fileEditorManager: FileEditorManager
    private lateinit var localFileSystem: LocalFileSystem

    @Before
    fun setUp() {
        fileEditorManager = FileEditorManager.getInstance(projectRule.project)
        localFileSystem = LocalFileSystem.getInstance()
    }

    @After
    fun cleanUp() {
        runInEdtAndWait {
            fileEditorManager.openFiles.forEach { fileEditorManager.closeFile(it) }
        }
    }

    @Test
    fun confirmConfigFileCreated_bothFilesDoNotExist() {
        val configFile = File(folderRule.newFolder(), "config")
        val credFile = File(folderRule.newFolder(), "credentials")

        val writer = mock<ConfigFilesFacade> {
            on { configPath }.thenReturn(configFile.toPath())
            on { credentialsPath }.thenReturn(credFile.toPath())
            on { createConfigFile() }.doAnswer { configFile.writeText("hello") }
        }

        val sut = CreateOrUpdateCredentialProfilesAction(writer)
        TestDialogManager.setTestDialog(TestDialog.OK)

        sut.actionPerformed(TestActionEvent { projectRule.project })

        verify(writer).createConfigFile()

        assertThat(fileEditorManager.openFiles).hasOnlyOneElementSatisfying { assertThat(it.name).isEqualTo("config") }
    }

    @Test
    fun bothFilesOpened_bothFilesExists() {
        val configFile = folderRule.newFile("config")
        val credFile = folderRule.newFile("credentials")
        val writer = mock<ConfigFilesFacade> {
            on { configPath }.thenReturn(configFile.toPath())
            on { credentialsPath }.thenReturn(credFile.toPath())
        }

        // IDE interprets blank files with no extension as binary
        configFile.writeText("config")
        credFile.writeText("cred")

        val sut = CreateOrUpdateCredentialProfilesAction(writer)
        TestDialogManager.setTestDialog(TestDialog.OK)

        sut.actionPerformed(TestActionEvent { projectRule.project })

        verify(writer, atLeastOnce()).configPath
        verify(writer, atLeastOnce()).credentialsPath
        verifyNoMoreInteractions(writer)

        assertThat(fileEditorManager.openFiles).hasSize(2)
            .anySatisfy { assertThat(it.name).isEqualTo("config") }
            .anySatisfy { assertThat(it.name).isEqualTo("credentials") }
    }

    @Test
    fun configFileOpened_onlyConfigExists() {
        val configFile = folderRule.newFile("config")
        val credFile = folderRule.newFile("credentials")
        credFile.delete()
        val writer = mock<ConfigFilesFacade> {
            on { configPath }.thenReturn(configFile.toPath())
            on { credentialsPath }.thenReturn(credFile.toPath())
        }

        configFile.writeText("config")

        val sut = CreateOrUpdateCredentialProfilesAction(writer)
        TestDialogManager.setTestDialog(TestDialog.OK)

        sut.actionPerformed(TestActionEvent { projectRule.project })

        verify(writer, atLeastOnce()).configPath
        verify(writer, atLeastOnce()).credentialsPath
        verifyNoMoreInteractions(writer)

        assertThat(fileEditorManager.openFiles).hasOnlyOneElementSatisfying { assertThat(it.name).isEqualTo("config") }
    }

    @Test
    fun credentialFileOpened_onlyCredentialsExists() {
        val configFile = folderRule.newFile("config")
        configFile.delete()
        val credFile = folderRule.newFile("credentials")
        val writer = mock<ConfigFilesFacade> {
            on { configPath }.thenReturn(configFile.toPath())
            on { credentialsPath }.thenReturn(credFile.toPath())
        }

        credFile.writeText("cred")

        val sut = CreateOrUpdateCredentialProfilesAction(writer)
        TestDialogManager.setTestDialog(TestDialog.OK)

        sut.actionPerformed(TestActionEvent { projectRule.project })

        verify(writer, atLeastOnce()).configPath
        verify(writer, atLeastOnce()).credentialsPath
        verifyNoMoreInteractions(writer)

        assertThat(fileEditorManager.openFiles).hasOnlyOneElementSatisfying { assertThat(it.name).isEqualTo("credentials") }
    }

    @Test
    fun emptyFileCanBeOpenedAsPlainText() {
        val configFile = folderRule.newFile("config")
        val credFile = folderRule.newFile("credentials")
        configFile.delete()
        val writer = mock<ConfigFilesFacade> {
            on { configPath }.thenReturn(configFile.toPath())
            on { credentialsPath }.thenReturn(credFile.toPath())
        }

        // Mark the file as unknown for the purpose of the test. This is needed because some
        // other extensions can have weird file type association patterns (like Docker having
        // *. (?)) which makes this test fail because it is not file type unknown
        localFileSystem.refreshAndFindFileByIoFile(credFile)
        runInEdtAndWait {
            ApplicationManager.getApplication().runWriteAction {
                FileTypeManagerEx.getInstanceEx().associatePattern(
                    FileTypes.UNKNOWN,
                    "credentials"
                )
            }
        }

        val sut = CreateOrUpdateCredentialProfilesAction(writer)
        TestDialogManager.setTestDialog(TestDialog.OK)

        sut.actionPerformed(TestActionEvent { projectRule.project })

        verify(writer, atLeastOnce()).configPath
        verify(writer, atLeastOnce()).credentialsPath
        verifyNoMoreInteractions(writer)

        assertThat(fileEditorManager.openFiles).hasOnlyOneElementSatisfying {
            assertThat(it.name).isEqualTo("credentials")
            // FIX_WHEN_MIN_IS_212: assert that type is `FileTypes.PLAIN_TEXT` or `DetectedByContentFileType`
            assertThat(it.fileType).isNotNull()
            assertThat(it.fileType).isNotEqualTo(FileTypes.UNKNOWN)
        }
    }

    @Test
    fun negativeConfirmationDoesNotCreateFile() {
        val configFile = folderRule.newFile("config")
        val credFile = folderRule.newFile("credentials")
        val writer = mock<ConfigFilesFacade> {
            on { configPath }.thenReturn(configFile.toPath())
            on { credentialsPath }.thenReturn(credFile.toPath())
        }

        val sut = CreateOrUpdateCredentialProfilesAction(writer)
        TestDialogManager.setTestDialog(TestDialog.NO)

        sut.actionPerformed(TestActionEvent { projectRule.project })

        verify(writer, atLeastOnce()).configPath
        verify(writer, atLeastOnce()).credentialsPath
        verifyNoMoreInteractions(writer)
    }
}
