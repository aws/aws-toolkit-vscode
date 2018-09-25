// Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials

import com.intellij.openapi.actionSystem.DataContext
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.ui.Messages
import com.intellij.openapi.ui.TestDialog
import com.intellij.testFramework.ProjectRule
import com.intellij.testFramework.TestActionEvent
import com.nhaarman.mockitokotlin2.any
import com.nhaarman.mockitokotlin2.doAnswer
import com.nhaarman.mockitokotlin2.mock
import com.nhaarman.mockitokotlin2.verify
import com.nhaarman.mockitokotlin2.verifyZeroInteractions
import org.assertj.core.api.Assertions.assertThat
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File

class CreateOrUpdateCredentialProfilesActionTest {

    @Rule
    @JvmField
    val folderRule = TemporaryFolder()

    @Rule
    @JvmField
    val projectRule = ProjectRule()

    private val fileEditorManager = FileEditorManager.getInstance(projectRule.project)

    @Test
    fun confirmCalledIfFileDoesNotExist() {
        val writer = mock<CredentialFileWriter> {
            on { createFile(any()) }.doAnswer { it.getArgument<File>(0).writeText("hello") }
        }

        val file = File(folderRule.newFolder(), "credentials")

        val sut = CreateOrUpdateCredentialProfilesAction(writer, file)
        Messages.setTestDialog(TestDialog.OK)

        sut.actionPerformed(TestActionEvent(DataContext { projectRule.project }))

        verify(writer).createFile(file)

        assertThat(fileEditorManager.openFiles).hasOnlyOneElementSatisfying { assertThat(it.name).isEqualTo("credentials") }
    }

    @Test
    fun negativeConfirmationDoesNotCreateFile() {
        val writer = mock<CredentialFileWriter>()

        val file = File(folderRule.newFolder(), "credentials")
        val sut = CreateOrUpdateCredentialProfilesAction(writer, file)
        Messages.setTestDialog(TestDialog.NO)

        sut.actionPerformed(TestActionEvent(DataContext { projectRule.project }))

        verifyZeroInteractions(writer)
    }
}