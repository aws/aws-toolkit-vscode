// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.importadder

import com.intellij.psi.PsiElement
import com.intellij.psi.PsiFile
import com.intellij.testFramework.runInEdtAndGet
import com.intellij.testFramework.runInEdtAndWait
import com.jetbrains.python.psi.LanguageLevel
import com.jetbrains.python.psi.PyElementGenerator
import com.jetbrains.python.psi.PyFile
import com.jetbrains.python.psi.PyFromImportStatement
import com.jetbrains.python.psi.PyImportStatement
import com.jetbrains.python.psi.PyImportStatementBase
import org.assertj.core.api.Assertions.assertThat
import org.junit.Test
import software.aws.toolkits.jetbrains.utils.rules.PythonCodeInsightTestFixtureRule

class CodeWhispererPythonImportAdderTest : CodeWhispererImportAdderTestBase(
    CodeWhispererPythonImportAdder(),
    PythonCodeInsightTestFixtureRule(),
    "py"
) {
    @Test
    fun `test createNewImportPsiElement returns PyImportStatementBase for an valid statement`() {
        testCreateNewImportPsiElementReturnValueForStatements(
            false,
            listOf(
                "from os import path",
                "import os"
            ),
            PyImportStatementBase::class.java
        )
    }

    @Test
    fun `test createNewImportPsiElement returns null for an invalid statement`() {
        testCreateNewImportPsiElementReturnValueForStatements(
            true,
            listOf(
                "foo bar baz\n",
                ""
            ),
            PyImportStatementBase::class.java
        )
    }

    @Test
    fun `test hasDuplicatedImportsHelper returns existing import for identical import`() {
        val newImport = createImport("import os")
        val existingImports = listOf(createImport("import os"))
        assertHasDuplicates(newImport, existingImports)
    }

    @Test
    fun `test hasDuplicatedImportsHelper returns existing import for identical import with 'as' name`() {
        val newImport = createImport("import os as my_os")
        val existingImports = listOf(createImport("import os as my_os"))
        assertHasDuplicates(newImport, existingImports)
    }

    @Test
    fun `test hasDuplicatedImportsHelper returns existing import statement when there is an exact duplicate`() {
        val import = createImport("import os")
        val existingImports = listOf(
            createImport("import os"),
            createImport("import sys")
        )
        assertHasDuplicates(import, existingImports)
    }

    @Test
    fun `test hasDuplicatedImportsHelper returns null when there is a import with everything same but alias`() {
        val import = createImport("import os as myos")
        val existingImports = listOf(
            createImport("import os"),
            createImport("import sys")
        )
        assertHasNoDuplicates(import, existingImports)
    }

    @Test
    fun `test hasDuplicatedImportsHelper returns null when there is a duplicate import from another module`() {
        val newImport = createImport("from os import path")
        val existingImports = listOf(
            createImport("import os"),
            createImport("import sys")
        )
        assertHasNoDuplicates(newImport, existingImports)
    }

    @Test
    fun `test hasDuplicatedImportsHelper returns null if there are no duplicates`() {
        val importElement = createImport("import re")
        val existingImports = listOf(createImport("import sys"), createImport("import os"))
        assertHasNoDuplicates(importElement, existingImports)
    }

    @Test
    fun `test hasDuplicatedImportsHelper returns null for empty list`() {
        val newImport = createImport("import os")
        val existingImports = emptyList<PsiElement>()
        assertHasNoDuplicates(newImport, existingImports)
    }

    @Test
    fun `test hasDuplicatedImportsHelper returns null for different import type`() {
        val newImport = createImport("from os import path")
        val existingImports = listOf(createImport("import os"))
        assertHasNoDuplicates(newImport, existingImports)
    }

    @Test
    fun `test hasDuplicatedImportsHelper returns null for different import statement`() {
        val newImport = createImport("import sys")
        val existingImports = listOf(createImport("import os"))
        assertHasNoDuplicates(newImport, existingImports)
    }

    @Test
    fun `test hasDuplicatedImportsHelper returns null for different 'as' name`() {
        val newImport = createImport("import os as my_os")
        val existingImports = listOf(createImport("import os as os_alias"))
        assertHasNoDuplicates(newImport, existingImports)
    }

    @Test
    fun `test hasDuplicatedImportsHelper returns null for different from import`() {
        val newImport = createImport("from os.path import join")
        val existingImports = listOf(createImport("from os import path"))
        assertHasNoDuplicates(newImport, existingImports)
    }

    @Test
    fun `test getTopLevelImports returns top level import statements`() {
        val psiFile = projectRule.fixture.configureByText(
            "test.py",
            """
        import os
        from typing import List
        import math
        
        def foo():
            pass
            """.trimIndent()
        )
        val imports = importAdder.getTopLevelImports(psiFile, projectRule.fixture.editor)
        assertThat(imports).hasSize(3)
        runInEdtAndWait {
            assertThat(imports.map { it.text }).containsExactlyInAnyOrder("import os", "from typing import List", "import math")
        }
    }

    @Test
    fun `test getTopLevelImports returns an empty list when there are no imports`() {
        val psiFile = projectRule.fixture.configureByText(
            "test.py",
            """
        def foo():
            pass
            """.trimIndent()
        )
        val imports = importAdder.getTopLevelImports(psiFile, projectRule.fixture.editor)
        assertThat(imports).isEmpty()
    }

    @Test
    fun `test getTopLevelImports returns an empty list when the PSI file is not a PyFile`() {
        runInEdtAndWait {
            val psiFile = projectRule.fixture.configureByText("test.txt", "Hello world")
            val imports = importAdder.getTopLevelImports(psiFile, projectRule.fixture.editor)
            assertThat(imports).isEmpty()
        }
    }

    @Test
    fun `test getLocalImports when there are no local imports`() {
        val psiFile = projectRule.fixture.configureByText(
            "test.py",
            """
            import os
            def foo():
                print('Hello, world!')
            """.trimIndent()
        )

        runInEdtAndWait {
            val localImports = importAdder.getLocalImports(psiFile, projectRule.fixture.editor)
            assertThat(localImports).isEmpty()
        }
    }

    @Test
    fun `test getLocalImports when the caret is inside a local import`() {
        val psiFile = projectRule.fixture.configureByText(
            "test.py",
            """
            def foo():
                from math import pi
                print("Hello world")
            """.trimIndent()
        )

        runInEdtAndWait {
            val editor = projectRule.fixture.editor
            editor.caretModel.moveToOffset(psiFile.text.indexOf("print"))

            val localImports = importAdder.getLocalImports(psiFile, editor)

            assertThat(localImports).hasSize(1)
            assertThat(localImports[0].text).isEqualTo("from math import pi")
        }
    }

    @Test
    fun `test getLocalImports when the caret is inside a block with local imports`() {
        val psiFile = projectRule.fixture.configureByText(
            "test.py",
            """
            def foo():
                from math import pi
                print(f'Pi is approximately {pi:.2f}')
                def bar():
                    from datetime import datetime
                    print(f'Today is {datetime.now():%Y-%m-%d}')
            """.trimIndent()
        )

        runInEdtAndWait {
            val editor = projectRule.fixture.editor
            editor.caretModel.moveToOffset(psiFile.text.indexOf("Today"))

            val localImports = importAdder.getLocalImports(psiFile, editor)

            assertThat(localImports).hasSize(2)
            assertThat(localImports.map { it.text }).containsExactlyInAnyOrder("from math import pi", "from datetime import datetime")
        }
    }

    @Test
    fun `test getLocalImports when the caret is outside of any local import block`() {
        val psiFile = projectRule.fixture.configureByText(
            "test.py",
            """
            def foo():
                print(f'Pi is approximately {pi:.2f}')
                def bar():
                    from datetime import datetime
                    print(f'Today is {datetime.now():%Y-%m-%d}')
            """.trimIndent()
        )

        runInEdtAndWait {
            val editor = projectRule.fixture.editor
            editor.caretModel.moveToOffset(psiFile.text.indexOf("f'Pi"))
            val localImports = importAdder.getLocalImports(psiFile, editor)
            assertThat(localImports).isEmpty()
        }
    }

    @Test
    fun `test addImport adds a new import statement to the file`() {
        val statement = "import os"
        assertImportAddedForPython(statement, true)
    }

    @Test
    fun `test addImport does not add duplicate import statements`() {
        val psiFile = projectRule.fixture.configureByText(
            "test.py",
            "from os import path"
        ) as PyFile
        val statement = "from os import path"
        assertImportAddedForPython(statement, true, psiFile)
    }

    @Test
    fun `test addImport handles import with 'as' keyword`() {
        val statement = "import os as my_os"
        assertImportAddedForPython(statement, true)
    }

    @Test
    fun `test addImport handles 'from xxx import yyy as zzz' import statements`() {
        val statement = "from os.path import join as path_join"
        assertImportAddedForPython(statement, true)
    }

    @Test
    fun `test addImport handles 'from xxx import all' import statements`() {
        val statement = "from os.path import *"
        assertImportAddedForPython(statement, true)
    }

    private fun assertImportAddedForPython(statement: String, isAdded: Boolean, psiFile: PsiFile? = null) {
        assertImportAdded(statement, isAdded, PyImportStatementBase::class.java, psiFile)
    }

    // only support 'from' or 'import' imports
    private fun createImport(importString: String): PsiElement {
        val importParts = importString.split(" ")
        val classType = if (importParts[0] == "from") PyFromImportStatement::class.java else PyImportStatement::class.java
        return runInEdtAndGet {
            return@runInEdtAndGet PyElementGenerator.getInstance(projectRule.project)
                .createFromText(LanguageLevel.getDefault(), classType, importString)
        }
    }

    override fun assertSameImport(import1: PsiElement, import2: PsiElement) {
        import1 as PyImportStatementBase
        import2 as PyImportStatementBase
        assertThat(import1::class.java).isEqualTo(import2::class.java)
        if (import1 is PyImportStatement) {
            import2 as PyImportStatement
        } else {
            import1 as PyFromImportStatement
            import2 as PyFromImportStatement
            assertThat(import1.importSourceQName.toString()).isEqualTo(import2.importSourceQName.toString())
        }
        assertThat(import1.fullyQualifiedObjectNames.toString()).isEqualTo(import2.fullyQualifiedObjectNames.toString())
        assertThat(import1.importElements.map { it.text }).containsExactlyInAnyOrder(*import2.importElements.map { it.text }.toTypedArray())
    }
}
