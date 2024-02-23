// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.importadder

import com.intellij.openapi.command.WriteCommandAction
import com.intellij.psi.PsiElement
import com.intellij.psi.PsiFile
import com.intellij.testFramework.runInEdtAndWait
import org.assertj.core.api.Assertions.assertThat
import org.junit.Before
import org.junit.Test
import org.mockito.Mockito.mock
import software.aws.toolkits.jetbrains.utils.rules.PythonCodeInsightTestFixtureRule

class CodeWhispererFallbackImportAdderTest : CodeWhispererImportAdderTestBase(
    CodeWhispererFallbackImportAdder(),
    PythonCodeInsightTestFixtureRule(),
    "txt"
) {
    private lateinit var psiFile: PsiFile

    @Before
    fun setUp() {
        runInEdtAndWait {
            psiFile = projectRule.fixture.configureByText("test.$fileExtension", "")
        }
    }

    @Test
    fun `test createNewImportPsiElement()`() {
        testCreateNewImportPsiElementReturnValueForStatements(
            false,
            listOf("import my.library\n", "import a from b\n", "from { a } import 'b'\n"),
            PsiElement::class.java
        )
    }

    @Test
    fun `test createNewImportPsiElement() adds newline char if it's not there`() {
        val statementWithoutNewLine = "import my.library"
        val expectedStatementWithNewLine = "import my.library\n"

        runInEdtAndWait {
            val newImportPsi = importAdder.createNewImportPsiElement(psiFile, statementWithoutNewLine)
            assertThat(newImportPsi).isNotNull
            assertThat(newImportPsi?.text).isEqualTo(expectedStatementWithNewLine)
        }
    }

    @Test
    fun `test hasDuplicatedImportsHelper()`() {
        val newImport = mock(PsiElement::class.java)
        val existingImports = listOf<PsiElement>()

        val result = importAdder.hasDuplicatedImportsHelper(newImport, existingImports)
        assertThat(result).isNull()
    }

    @Test
    fun `test getTopLevelImports()`() {
        val topLevelImports = importAdder.getTopLevelImports(psiFile, projectRule.fixture.editor)
        assertThat(topLevelImports).isEqualTo(emptyList<PsiElement>())
    }

    @Test
    fun `test getLocalImports()`() {
        val localImports = importAdder.getLocalImports(psiFile, projectRule.fixture.editor)
        assertThat(localImports).isEqualTo(emptyList<PsiElement>())
    }

    @Test
    fun `test addImport()`() {
        val statement = "import my.library\n"
        runInEdtAndWait {
            val newImport = importAdder.createNewImportPsiElement(psiFile, statement) ?: return@runInEdtAndWait
            WriteCommandAction.runWriteCommandAction(psiFile.project) {
                val result = importAdder.addImport(psiFile, projectRule.fixture.editor, newImport)
                assertThat(result).isTrue
            }
            assertThat(psiFile.children[0].text).isEqualTo(statement)
        }
    }
}
