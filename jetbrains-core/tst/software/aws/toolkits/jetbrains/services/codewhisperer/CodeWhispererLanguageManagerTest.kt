// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer

import com.intellij.openapi.application.ApplicationManager
import com.intellij.testFramework.DisposableRule
import com.intellij.testFramework.replaceService
import org.assertj.core.api.Assertions.assertThat
import org.junit.Rule
import org.junit.Test
import org.mockito.internal.verification.Times
import org.mockito.kotlin.doReturn
import org.mockito.kotlin.eq
import org.mockito.kotlin.mock
import org.mockito.kotlin.spy
import org.mockito.kotlin.verify
import software.aws.toolkits.jetbrains.services.codewhisperer.language.CodeWhispererLanguageManager
import software.aws.toolkits.jetbrains.services.codewhisperer.language.toCodeWhispererLanguage
import software.aws.toolkits.jetbrains.services.codewhisperer.language.toProgrammingLanguage
import software.aws.toolkits.jetbrains.services.codewhisperer.model.CaretContext
import software.aws.toolkits.jetbrains.services.codewhisperer.model.FileContextInfo
import software.aws.toolkits.jetbrains.services.codewhisperer.model.ProgrammingLanguage
import software.aws.toolkits.jetbrains.services.codewhisperer.service.CodeWhispererService
import software.aws.toolkits.jetbrains.utils.rules.PythonCodeInsightTestFixtureRule
import software.aws.toolkits.telemetry.CodewhispererLanguage

class CodeWhispererLanguageManagerTest {
    @Rule
    @JvmField
    var projectRule = PythonCodeInsightTestFixtureRule()

    @Rule
    @JvmField
    val disposableRule = DisposableRule()

    @Test
    fun `test ProgrammingLanguage class`() {
        // isEqualTo() is based on languageName field, which is case-insensitive
        assertThat(ProgrammingLanguage("JAVA")).isEqualTo(ProgrammingLanguage("Java"))
        assertThat(ProgrammingLanguage("JAVA").languageName).isEqualTo("java")

        assertThat(ProgrammingLanguage("JavaScript")).isEqualTo(ProgrammingLanguage("javascript"))
        assertThat(ProgrammingLanguage("JavaScript").languageName).isEqualTo("javascript")
    }

    @Test
    fun `test isLanguageSupported`() {
        val manager = CodeWhispererLanguageManager()

        // ProgrammingLanguage is case-insensitive
        assertThat(manager.isLanguageSupported(ProgrammingLanguage("java"))).isTrue
        assertThat(manager.isLanguageSupported(ProgrammingLanguage("Java"))).isTrue

        assertThat(manager.isLanguageSupported(ProgrammingLanguage("python"))).isTrue
        assertThat(manager.isLanguageSupported(ProgrammingLanguage("Python"))).isTrue

        assertThat(manager.isLanguageSupported(ProgrammingLanguage("jsx"))).isTrue
        assertThat(manager.isLanguageSupported(ProgrammingLanguage("JSX"))).isTrue

        assertThat(manager.isLanguageSupported(ProgrammingLanguage("javascript"))).isTrue
        assertThat(manager.isLanguageSupported(ProgrammingLanguage("JavaScript"))).isTrue

        assertThat(manager.isLanguageSupported(ProgrammingLanguage("plain_text"))).isFalse
        assertThat(manager.isLanguageSupported(ProgrammingLanguage("plaintext"))).isFalse

        assertThat(manager.isLanguageSupported(ProgrammingLanguage("cpp"))).isFalse
        assertThat(manager.isLanguageSupported(ProgrammingLanguage("unknown"))).isFalse
    }

    @Test
    fun `test ProgrammingLanguage toCodeWhispererLanguage`() {
        assertThat(ProgrammingLanguage("java").toCodeWhispererLanguage()).isEqualTo(CodewhispererLanguage.Java)
        assertThat(ProgrammingLanguage("Java").toCodeWhispererLanguage()).isEqualTo(CodewhispererLanguage.Java)

        assertThat(ProgrammingLanguage("python").toCodeWhispererLanguage()).isEqualTo(CodewhispererLanguage.Python)
        assertThat(ProgrammingLanguage("Python").toCodeWhispererLanguage()).isEqualTo(CodewhispererLanguage.Python)

        assertThat(ProgrammingLanguage("javascript").toCodeWhispererLanguage()).isEqualTo(CodewhispererLanguage.Javascript)
        assertThat(ProgrammingLanguage("JavaScript").toCodeWhispererLanguage()).isEqualTo(CodewhispererLanguage.Javascript)

        assertThat(ProgrammingLanguage("jsx").toCodeWhispererLanguage()).isEqualTo(CodewhispererLanguage.Jsx)
        assertThat(ProgrammingLanguage("JSX").toCodeWhispererLanguage()).isEqualTo(CodewhispererLanguage.Jsx)
    }

    @Test
    fun `test CodewhispererLanguage toProgrammingLanguage`() {
        assertThat(CodewhispererLanguage.Python.toProgrammingLanguage()).isEqualTo(
            ProgrammingLanguage(CodewhispererLanguage.Python)
        )
        assertThat(CodewhispererLanguage.Java.toProgrammingLanguage()).isEqualTo(
            ProgrammingLanguage(CodewhispererLanguage.Java)
        )
        assertThat(CodewhispererLanguage.Javascript.toProgrammingLanguage()).isEqualTo(
            ProgrammingLanguage(CodewhispererLanguage.Javascript)
        )
        assertThat(CodewhispererLanguage.Jsx.toProgrammingLanguage()).isEqualTo(
            ProgrammingLanguage(CodewhispererLanguage.Jsx)
        )
        assertThat(CodewhispererLanguage.Plaintext.toProgrammingLanguage()).isEqualTo(
            ProgrammingLanguage(CodewhispererLanguage.Plaintext)
        )
        assertThat(CodewhispererLanguage.Unknown.toProgrammingLanguage()).isEqualTo(
            ProgrammingLanguage(CodewhispererLanguage.Unknown)
        )
    }

    @Test
    fun `test getParentLanguage`() {
        val manager = CodeWhispererLanguageManager()
        val javaLang = ProgrammingLanguage(CodewhispererLanguage.Java)
        val pythonLang = ProgrammingLanguage(CodewhispererLanguage.Python)
        val javascriptLang = ProgrammingLanguage(CodewhispererLanguage.Javascript)
        val jsxLang = ProgrammingLanguage(CodewhispererLanguage.Jsx)
        val plainText = ProgrammingLanguage(CodewhispererLanguage.Plaintext)
        val unknown = ProgrammingLanguage(CodewhispererLanguage.Unknown)

        assertThat(manager.getParentLanguage(javaLang)).isEqualTo(javaLang)
        assertThat(manager.getParentLanguage(pythonLang)).isEqualTo(pythonLang)
        assertThat(manager.getParentLanguage(javascriptLang)).isEqualTo(javascriptLang)
        assertThat(manager.getParentLanguage(plainText)).isEqualTo(plainText)
        assertThat(manager.getParentLanguage(unknown)).isEqualTo(unknown)

        // JSX is the only case which will map to different language (javascript)
        assertThat(manager.getParentLanguage(jsxLang)).isEqualTo(javascriptLang)
    }

    @Test
    fun `test cwsprService buildCodeWhispererRequest should call getParentLanguage once`() {
        testgetParentLanguageUtil("test.jsx", "jsx harmony")
        testgetParentLanguageUtil("test.py", "python")
        testgetParentLanguageUtil("test.java", "java")
        testgetParentLanguageUtil("test.js", "javascript")
    }

    private fun testgetParentLanguageUtil(fileName: String, languageName: String) {
        val languageManager = spy(CodeWhispererLanguageManager())
        ApplicationManager.getApplication().replaceService(CodeWhispererLanguageManager::class.java, languageManager, disposableRule.disposable)

        val caretContextMock = mock<CaretContext> {
            on { leftFileContext } doReturn ""
            on { rightFileContext } doReturn ""
        }

        val fileContextInfo = mock<FileContextInfo> {
            on { programmingLanguage } doReturn ProgrammingLanguage(languageName)
            on { caretContext } doReturn caretContextMock
            on { filename } doReturn fileName
        }

        CodeWhispererService.buildCodeWhispererRequest(fileContextInfo)

        verify(languageManager, Times(1)).getParentLanguage(eq(ProgrammingLanguage(languageName)))
    }
}
