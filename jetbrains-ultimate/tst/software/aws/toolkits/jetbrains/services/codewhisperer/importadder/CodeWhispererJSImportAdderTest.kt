// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.importadder

import com.intellij.lang.ecmascript6.psi.ES6ImportDeclaration
import com.intellij.lang.javascript.JavascriptLanguage
import com.intellij.psi.PsiElement
import com.intellij.psi.PsiFile
import com.intellij.psi.PsiFileFactory
import com.intellij.psi.util.PsiTreeUtil
import com.intellij.testFramework.runInEdtAndGet
import com.intellij.testFramework.runInEdtAndWait
import org.assertj.core.api.Assertions.assertThat
import org.junit.Test
import software.aws.toolkits.jetbrains.utils.rules.NodeJsCodeInsightTestFixtureRule
import kotlin.test.fail

class CodeWhispererJSImportAdderTest : CodeWhispererImportAdderTestBase(
    CodeWhispererJSImportAdder(),
    NodeJsCodeInsightTestFixtureRule(),
    "js"
) {

    @Test
    fun `test createNewImportPsiElement returns PyImportStatementBase for an valid statement`() {
        testCreateNewImportPsiElementReturnValueForStatements(
            false,
            listOf(
                "import { React } from 'react'",
                "import os"
            ),
            ES6ImportDeclaration::class.java
        )
    }

    @Test
    fun `test createNewImportPsiElement returns null for an invalid statement`() {
        testCreateNewImportPsiElementReturnValueForStatements(
            true,
            listOf(
                "invalid statement\n",
                "console.log('Hello, world!')",
                "require('os')"
            ),
            ES6ImportDeclaration::class.java
        )
    }

    @Test
    fun `test hasDuplicatedImportsHelper returns null for non-duplicate import`() {
        val newImport = createImport("import { Component } from 'react'")
        val existingImports = listOf(
            createImport("import React from 'react'"),
            createImport("import PropTypes from 'prop-types'")
        )

        assertHasNoDuplicates(newImport, existingImports)
    }

    @Test
    fun `test hasDuplicatedImportsHelper returns existing import for identical import`() {
        val newImport = createImport("import { useState } from 'react'")
        val existingImports = listOf(createImport("import { useState } from 'react'"))

        assertHasDuplicates(newImport, existingImports)
    }

    @Test
    fun `test hasDuplicatedImportsHelper returns null for same import names with different alias`() {
        val newImport = createImport("import { useState as useLocalState } from 'react'")
        val existingImports = listOf(createImport("import { useState } from 'react'"))

        assertHasNoDuplicates(newImport, existingImports)
    }

    @Test
    fun `test hasDuplicatedImportsHelper returns null for non-duplicate from import`() {
        val newImport = createImport("import someDefaultExport from './module'")
        val existingImports = listOf(
            createImport("import someNamedExport from './module'"),
            createImport("import anotherNamedExport from './module'")
        )
        assertHasNoDuplicates(newImport, existingImports)
    }

    @Test
    fun `test hasDuplicatedImportsHelper returns existing import for identical from import`() {
        val newImport = createImport("import { someNamedExport } from './module'")
        val existingImports = listOf(createImport("import { someNamedExport } from './module'"))

        assertHasDuplicates(newImport, existingImports)
    }

    @Test
    fun `test hasDuplicatedImportsHelper returns existing import for duplicate from import with different alias`() {
        val newImport = createImport("import { someNamedExport as someAlias } from './module'")
        val existingImports = listOf(createImport("import { someNamedExport as anotherAlias } from './module'"))

        assertHasNoDuplicates(newImport, existingImports)
    }

    @Test
    fun `test getTopLevelImports returns top level import statements`() {
        runInEdtAndWait {
            val psiFile = projectRule.fixture.configureByText(
                "test.js",
                """
            import React from 'react';
            import { connect } from 'react-redux';
            import MyComponent from './MyComponent';
            
            function doSomething() {
                const myConstant = 42;
                return myConstant;
            }
                """.trimIndent()
            )
            val imports = importAdder.getTopLevelImports(psiFile, projectRule.fixture.editor)
            assertThat(imports).hasSize(3)
            assertThat(imports.map { it.text }).containsExactlyInAnyOrder(
                "import React from 'react';",
                "import { connect } from 'react-redux';",
                "import MyComponent from './MyComponent';"
            )
        }
    }

    @Test
    fun `test getTopLevelImports returns empty list when there are no top level imports`() {
        runInEdtAndWait {
            val psiFile = projectRule.fixture.configureByText(
                "test.js",
                """
            function doSomething() {
                const myConstant = 42;
                return myConstant;
            }
                """.trimIndent()
            )
            val imports = importAdder.getTopLevelImports(psiFile, projectRule.fixture.editor)
            assertThat(imports).isEmpty()
        }
    }

    @Test
    fun `test getTopLevelImports returns empty list when file is empty`() {
        runInEdtAndWait {
            val psiFile = projectRule.fixture.configureByText("test.js", "")
            val imports = importAdder.getTopLevelImports(psiFile, projectRule.fixture.editor)
            assertThat(imports).isEmpty()
        }
    }

    @Test
    fun `test getLocalImports when there are no local imports`() {
        val psiFile = projectRule.fixture.configureByText(
            "test.js",
            """
        import React from 'react';
        const greeting = 'Hello, world!';
            """.trimIndent()
        )

        runInEdtAndWait {
            val localImports = importAdder.getLocalImports(psiFile, projectRule.fixture.editor)
            assertThat(localImports).isEmpty()
        }
    }

    @Test
    fun `test getLocalImports when there is a local import within a function`() {
        val psiFile = projectRule.fixture.configureByText(
            "test.js",
            """
        import React from 'react';
        function greet() {
            import { format } from 'date-fns';
            console.log(format(new Date(), 'yyyy-MM-dd'));
        }
            """.trimIndent()
        )

        runInEdtAndWait {
            val editor = projectRule.fixture.editor
            editor.caretModel.moveToOffset(psiFile.text.indexOf("console.log"))
            val localImports = importAdder.getLocalImports(psiFile, projectRule.fixture.editor)
            assertThat(localImports).hasSize(1)
            assertThat(localImports[0].text).isEqualTo("import { format } from 'date-fns';")
        }
    }

    @Test
    fun `test getLocalImports when there are multiple local imports within a function`() {
        val psiFile = projectRule.fixture.configureByText(
            "test.js",
            """
        import React from 'react';
        function greet() {
            import { format } from 'date-fns';
            const greeting = 'Hello, world!';
            import { add } from 'lodash';
            console.log(format(new Date(), 'yyyy-MM-dd'));
        }
            """.trimIndent()
        )

        runInEdtAndWait {
            val editor = projectRule.fixture.editor
            editor.caretModel.moveToOffset(psiFile.text.indexOf("const greeting"))
            val localImports = importAdder.getLocalImports(psiFile, projectRule.fixture.editor)
            assertThat(localImports).hasSize(2)
            assertThat(localImports[0].text).isEqualTo("import { format } from 'date-fns';")
            assertThat(localImports[1].text).isEqualTo("import { add } from 'lodash';")
        }
    }

    @Test
    fun `test addImport adds a new specifier import statement with alias to the file`() {
        val statement = "import { os as oos } from 'os';"
        assertImportAddedForJS(statement, true)
    }

    @Test
    fun `test addImport adds a new import statement to the file`() {
        val statement = "import os from 'os';"
        assertImportAddedForJS(statement, true)
    }

    @Test
    fun `test addImport returns true if the import has a default binding`() {
        val statement = "import myFunction, { myOtherFunction } from 'module';"
        assertImportAddedForJS(statement, true)
    }

    @Test
    fun `test addImport returns true if the import has a namespace binding`() {
        val statement = "import * as myModule from 'module';"
        assertImportAddedForJS(statement, true)
    }

    private fun createImport(statement: String): PsiElement =
        runInEdtAndGet {
            val fileFactory = PsiFileFactory.getInstance(projectRule.project)
            val dummyFile = fileFactory.createFileFromText("dummy.js", JavascriptLanguage.INSTANCE, statement)
            val importDeclarations = PsiTreeUtil.getChildrenOfType(dummyFile, ES6ImportDeclaration::class.java)
            importDeclarations?.first() ?: fail()
        }

    private fun assertImportAddedForJS(statement: String, isAdded: Boolean, psiFile: PsiFile? = null) {
        assertImportAdded(statement, isAdded, ES6ImportDeclaration::class.java, psiFile)
    }

    override fun assertSameImport(import1: PsiElement, import2: PsiElement) {
        import1 as ES6ImportDeclaration
        import2 as ES6ImportDeclaration
        assertThat(import1.importedBindings.map { it.text }).containsExactlyInAnyOrder(
            *import2.importedBindings.map { it.text }.toTypedArray()
        )
        assertThat(import1.fromClause?.referenceText?.trim { it == '\'' || it == '\"' }).isEqualTo(
            import2.fromClause?.referenceText?.trim { it == '\'' || it == '\"' }
        )
        assertThat(import1.importModuleText).isEqualTo(import2.importModuleText)
        assertThat(import1.importSpecifiers.map { it.text }).containsExactlyInAnyOrder(
            *import2.importSpecifiers.map { it.text }.toTypedArray()
        )
    }
}
