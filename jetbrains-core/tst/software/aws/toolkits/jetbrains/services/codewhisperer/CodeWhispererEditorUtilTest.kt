// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer

import com.intellij.openapi.command.WriteCommandAction
import com.intellij.openapi.fileTypes.FileType
import com.intellij.openapi.project.Project
import com.intellij.psi.PsiFile
import com.intellij.testFramework.fixtures.CodeInsightTestFixture
import com.intellij.testFramework.runInEdtAndGet
import org.assertj.core.api.Assertions.assertThat
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.mockito.kotlin.doReturn
import org.mockito.kotlin.mock
import software.aws.toolkits.jetbrains.services.codewhisperer.CodeWhispererTestUtil.pythonFileName
import software.aws.toolkits.jetbrains.services.codewhisperer.CodeWhispererTestUtil.pythonTestLeftContext
import software.aws.toolkits.jetbrains.services.codewhisperer.editor.CodeWhispererEditorUtil
import software.aws.toolkits.jetbrains.services.codewhisperer.editor.CodeWhispererEditorUtil.programmingLanguage
import software.aws.toolkits.jetbrains.utils.rules.PythonCodeInsightTestFixtureRule

class CodeWhispererEditorUtilTest {
    @Rule
    @JvmField
    var projectRule = PythonCodeInsightTestFixtureRule()

    private lateinit var project: Project
    private lateinit var fixture: CodeInsightTestFixture

    @Before
    fun setup() {
        project = projectRule.project
        fixture = projectRule.fixture
    }

    @Test
    fun `test psiFile_programmingLanguage`() {
        val fileTypeMock = mock<FileType> {
            on { name } doReturn "Java"
        }
        val psiFile = mock<PsiFile> {
            on { fileType } doReturn fileTypeMock
        }
        val programmingLanguage = psiFile.programmingLanguage
        assertThat(programmingLanguage.languageName).isEqualTo("java")
    }

    @Test
    fun `test getFileContextInfo`() {
        val psiFile = fixture.configureByText(pythonFileName, pythonTestLeftContext)
        val fileContext = runInEdtAndGet {
            fixture.editor.caretModel.moveToOffset(fixture.editor.document.textLength)
            CodeWhispererEditorUtil.getFileContextInfo(fixture.editor, psiFile)
        }

        assertThat(fileContext.filename).isEqualTo(pythonFileName)
        assertThat(fileContext.programmingLanguage.languageName).isEqualTo("python")
        assertThat(fileContext.caretContext.leftFileContext).isEqualTo(pythonTestLeftContext)
        assertThat(fileContext.caretContext.rightFileContext).isEqualTo("")
    }

    /**
     * # function to add 2 numbers
     * def addTwoNumbers(a, b)
     *                  ^
     *                  cursor
     */
    @Test
    fun `test extractCaretContext`() {
        val pythonComment = "# function to add 2 numbers\n"
        val pythonTestRightContext = "(a, b)"
        fixture.configureByText(pythonFileName, pythonComment)
        val caretContext = runInEdtAndGet {
            WriteCommandAction.runWriteCommandAction(project) {
                fixture.editor.caretModel.moveToOffset(fixture.editor.document.textLength)
                fixture.editor.document.insertString(fixture.editor.caretModel.offset, pythonTestLeftContext)

                fixture.editor.caretModel.moveToOffset(fixture.editor.document.textLength)
                fixture.editor.document.insertString(fixture.editor.caretModel.offset, pythonTestRightContext)
            }

            CodeWhispererEditorUtil.extractCaretContext(fixture.editor)
        }

        assertThat(caretContext.leftFileContext).isEqualTo("$pythonComment$pythonTestLeftContext")
        assertThat(caretContext.rightFileContext).isEqualTo(pythonTestRightContext)
        assertThat(caretContext.leftContextOnCurrentLine).isEqualTo(pythonTestLeftContext)
    }
}
