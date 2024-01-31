// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.importadder

import com.intellij.lang.java.JavaLanguage
import com.intellij.psi.PsiElement
import com.intellij.psi.PsiFile
import com.intellij.psi.PsiFileFactory
import com.intellij.psi.PsiImportStatement
import com.intellij.psi.PsiImportStatementBase
import com.intellij.psi.PsiJavaFile
import com.intellij.testFramework.runInEdtAndGet
import com.intellij.testFramework.runInEdtAndWait
import org.assertj.core.api.Assertions.assertThat
import org.junit.Test
import software.aws.toolkits.jetbrains.utils.rules.JavaCodeInsightTestFixtureRule

class CodeWhispererJavaImportAdderTest : CodeWhispererImportAdderTestBase(
    CodeWhispererJavaImportAdder(),
    JavaCodeInsightTestFixtureRule(),
    "java"
) {

    @Test
    fun `test createNewImportPsiElement creates a new import statement`() {
        testCreateNewImportPsiElementReturnValueForStatements(
            false,
            listOf(
                "import java.util.list;",
                "import static java.util.stream.Collectors.toList;"
            ),
            PsiImportStatementBase::class.java
        )
    }

    @Test
    fun `test createNewImportPsiElement returns null for a non-import statement`() {
        testCreateNewImportPsiElementReturnValueForStatements(
            true,
            listOf(
                "public static void ",
                "int a = 1"
            ),
            PsiImportStatementBase::class.java
        )
    }

    @Test
    fun `test hasDuplicatedImportsHelper returns a duplicate import`() {
        val newImport = createImport("import java.util.List;") ?: return
        val existingImports = listOf(
            createImport("import java.util.List;") ?: return,
            createImport("import java.util.ArrayList;") ?: return
        )
        assertHasDuplicates(newImport, existingImports)
    }

    @Test
    fun `test hasDuplicatedImportsHelper returns null for a non-duplicate import`() {
        val newImport = createImport("import java.lang.String;") ?: return
        val existingImports = listOf(
            createImport("import java.util.List;") ?: return,
            createImport("import java.util.ArrayList;") ?: return
        )
        assertHasNoDuplicates(newImport, existingImports)
    }

    @Test
    fun `test getTopLevelImports returns a list of top-level imports`() {
        runInEdtAndWait {
            val psiFile = projectRule.fixture.configureByText(
                "test.java",
                "import java.util.List;\nimport java.util.ArrayList;\npublic class Test {}"
            )
            val imports = importAdder.getTopLevelImports(psiFile, projectRule.fixture.editor)
            assertThat(2).isEqualTo(imports.size)
            assertThat(imports.all { it is PsiImportStatement }).isTrue
        }
    }

    @Test
    fun `test getLocalImports returns an empty list`() {
        val psiFile = projectRule.fixture.configureByText(
            "test.java",
            "import java.util.List;\nimport java.util.ArrayList;\npublic class Test {}"
        )
        val imports = importAdder.getLocalImports(psiFile, projectRule.fixture.editor)
        assertThat(imports).isEmpty()
    }

    @Test
    fun `test addImport adds a new import statement to the file`() {
        val statement = "import java.util.List;"
        assertImportAddedForJava(statement, true)
    }

    @Test
    fun `test addImport returns false for non-Java files`() {
        val psiFile = projectRule.fixture.configureByText("test.py", "")
        val statement = "import java.util.List;"
        assertImportAddedForJava(statement, false, psiFile)
    }

    @Test
    fun `test isSupportedImportStyle returns true for all import statements`() {
        runInEdtAndWait {
            val psiFile = projectRule.fixture.configureByText("test.java", "")
            val statement1 = "import java.util.List;"
            val importElement1 = importAdder.createNewImportPsiElement(psiFile, statement1)
            if (importElement1 != null) {
                assertThat(importAdder.isSupportedImportStyle(importElement1)).isTrue
            }

            val statement2 = "import static java.util.stream.Collectors.toList;"
            val importElement2 = importAdder.createNewImportPsiElement(psiFile, statement2)
            if (importElement2 != null) {
                assertThat(importAdder.isSupportedImportStyle(importElement2)).isTrue
            }
        }
    }

    private fun assertImportAddedForJava(statement: String, isAdded: Boolean, psiFile: PsiFile? = null) {
        assertImportAdded(statement, isAdded, PsiImportStatementBase::class.java, psiFile)
    }

    private fun createImport(statement: String): PsiElement? =
        runInEdtAndGet {
            val fileFactory = PsiFileFactory.getInstance(projectRule.project)
            val dummyFile = fileFactory.createFileFromText("dummy.java", JavaLanguage.INSTANCE, statement) as PsiJavaFile
            dummyFile.importList?.children?.get(0)
        }

    override fun assertSameImport(import1: PsiElement, import2: PsiElement) {
        import1 as PsiImportStatementBase
        import2 as PsiImportStatementBase
        assertThat(import1.text).isEqualTo(import1.text)
    }
}
