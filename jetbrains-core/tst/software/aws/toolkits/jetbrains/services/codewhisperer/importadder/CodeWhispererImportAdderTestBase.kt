// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.importadder

import com.intellij.openapi.command.WriteCommandAction
import com.intellij.psi.PsiElement
import com.intellij.psi.PsiFile
import com.intellij.psi.PsiImportStatementBase
import com.intellij.psi.PsiJavaFile
import com.intellij.testFramework.runInEdtAndGet
import com.intellij.testFramework.runInEdtAndWait
import org.assertj.core.api.Assertions.assertThat
import org.junit.Rule
import software.aws.toolkits.jetbrains.utils.rules.CodeInsightTestFixtureRule
import kotlin.test.fail

open class CodeWhispererImportAdderTestBase(
    val importAdder: CodeWhispererImportAdder,
    @Rule @JvmField val projectRule: CodeInsightTestFixtureRule,
    internal val fileExtension: String
) {

    fun <T> testCreateNewImportPsiElementReturnValueForStatements(
        returnNull: Boolean,
        statements: List<String>,
        classType: Class<T>
    ) {
        val psiFile = projectRule.fixture.configureByText("test.$fileExtension", "")
        for (statement in statements) {
            runInEdtAndWait {
                val psiElement = importAdder.createNewImportPsiElement(psiFile, statement)
                assertThat(psiElement == null).isEqualTo(returnNull)
                if (!returnNull) {
                    assertThat(psiElement).isInstanceOf(classType)
                    assertThat(psiElement?.text).isEqualToIgnoringNewLines(statement.trim())
                }
            }
        }
    }

    fun assertHasDuplicates(newImport: PsiElement, existingImports: List<PsiElement>) {
        runInEdtAndWait {
            val result = importAdder.hasDuplicatedImportsHelper(newImport, existingImports)
            assertThat(result).isNotNull
            if (result == null) return@runInEdtAndWait
            assertThat(result.text).isEqualTo(newImport.text)
        }
    }

    fun assertHasNoDuplicates(newImport: PsiElement, existingImports: List<PsiElement>) {
        runInEdtAndWait {
            val result = importAdder.hasDuplicatedImportsHelper(newImport, existingImports)
            assertThat(result).isNull()
        }
    }

    open fun assertSameImport(import1: PsiElement, import2: PsiElement) {
        fail("Implement this")
    }

    fun <T> assertImportAdded(statement: String, isAdded: Boolean, classType: Class<T>, file: PsiFile? = null) {
        runInEdtAndWait {
            val psiFile = file ?: projectRule.fixture.configureByText("test.$fileExtension", "")
            val importElement = runInEdtAndGet {
                val importElement = importAdder.createNewImportPsiElement(psiFile, statement) ?: return@runInEdtAndGet null
                WriteCommandAction.runWriteCommandAction<PsiElement>(psiFile.project) {
                    val result = importAdder.addImport(psiFile, projectRule.fixture.editor, importElement)
                    assertThat(result).isEqualTo(isAdded)
                    importElement
                }
            }
            assertThat(importElement).isNotNull
            if (importElement == null) return@runInEdtAndWait

            if (isAdded) {
                runInEdtAndWait {
                    val children =
                        if (fileExtension == "java" && classType == PsiImportStatementBase::class.java) {
                            (psiFile as PsiJavaFile).importList?.children
                        } else {
                            psiFile.children
                        }
                    val imports = children?.filter { classType.isInstance(it) }?.toList().orEmpty()
                    assertThat(imports).hasSize(1)
                    assertSameImport(imports[0], importElement)
                }
            }
        }
    }
}
