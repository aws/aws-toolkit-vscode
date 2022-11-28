// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer

import com.intellij.openapi.extensions.ExtensionPointName
import com.intellij.openapi.fileTypes.FileType
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.psi.PsiFile
import com.intellij.testFramework.ApplicationRule
import com.intellij.testFramework.DisposableRule
import org.assertj.core.api.Assertions.assertThat
import org.junit.Rule
import org.junit.Test
import org.mockito.kotlin.doReturn
import org.mockito.kotlin.mock
import software.aws.toolkits.jetbrains.services.codewhisperer.language.CodeWhispererLanguageManager
import software.aws.toolkits.jetbrains.services.codewhisperer.language.CodeWhispererProgrammingLanguage
import software.aws.toolkits.jetbrains.services.codewhisperer.language.languages.CodeWhispererCsharp
import software.aws.toolkits.jetbrains.services.codewhisperer.language.languages.CodeWhispererJava
import software.aws.toolkits.jetbrains.services.codewhisperer.language.languages.CodeWhispererJavaScript
import software.aws.toolkits.jetbrains.services.codewhisperer.language.languages.CodeWhispererJsx
import software.aws.toolkits.jetbrains.services.codewhisperer.language.languages.CodeWhispererPlainText
import software.aws.toolkits.jetbrains.services.codewhisperer.language.languages.CodeWhispererPython
import software.aws.toolkits.jetbrains.services.codewhisperer.language.languages.CodeWhispererTsx
import software.aws.toolkits.jetbrains.services.codewhisperer.language.languages.CodeWhispererTypeScript
import software.aws.toolkits.jetbrains.services.codewhisperer.language.languages.CodeWhispererUnknownLanguage
import software.aws.toolkits.jetbrains.utils.rules.PythonCodeInsightTestFixtureRule
import software.aws.toolkits.telemetry.CodewhispererLanguage
import kotlin.reflect.full.createInstance
import kotlin.reflect.full.primaryConstructor
import kotlin.reflect.jvm.isAccessible

class CodeWhispererLanguageManagerTest {
    @Rule
    @JvmField
    val applicationRule = ApplicationRule()

    @Rule
    @JvmField
    val projectRule = PythonCodeInsightTestFixtureRule()

    @Rule
    @JvmField
    val disposableRule = DisposableRule()

    val manager = CodeWhispererLanguageManager()

    @Test
    fun `test CodeWhispererProgrammingLanguage should be singleton`() {
        val fileTypeMock = mock<FileType> {
            on { name } doReturn "java"
        }
        val vFileMock = mock<VirtualFile> {
            on { fileType } doReturn fileTypeMock
        }

        val lang1 = manager.getLanguage(vFileMock)
        val lang2 = manager.getLanguage(vFileMock)

        assertThat(lang1).isSameAs(lang2)
    }

    @Test
    fun `test getProgrammingLanguage(virtualFile)`() {
        testGetProgrammingLanguageUtil("java", CodeWhispererJava::class.java)
        testGetProgrammingLanguageUtil("Java", CodeWhispererJava::class.java)
        testGetProgrammingLanguageUtil("JAVA", CodeWhispererJava::class.java)

        testGetProgrammingLanguageUtil("python", CodeWhispererPython::class.java)
        testGetProgrammingLanguageUtil("Python", CodeWhispererPython::class.java)

        testGetProgrammingLanguageUtil("javascript", CodeWhispererJavaScript::class.java)
        testGetProgrammingLanguageUtil("JavaScript", CodeWhispererJavaScript::class.java)

        testGetProgrammingLanguageUtil("jsx harmony", CodeWhispererJsx::class.java)

        testGetProgrammingLanguageUtil("typescript jsx", CodeWhispererTsx::class.java)

        testGetProgrammingLanguageUtil("typescript", CodeWhispererTypeScript::class.java)
        testGetProgrammingLanguageUtil("TypeScript", CodeWhispererTypeScript::class.java)

        testGetProgrammingLanguageUtil("c#", CodeWhispererCsharp::class.java)
        testGetProgrammingLanguageUtil("C#", CodeWhispererCsharp::class.java)

        testGetProgrammingLanguageUtil("plain_text", CodeWhispererPlainText::class.java)

        testGetProgrammingLanguageUtil("cpp", CodeWhispererUnknownLanguage::class.java)
        testGetProgrammingLanguageUtil("ruby", CodeWhispererUnknownLanguage::class.java)
        testGetProgrammingLanguageUtil("c", CodeWhispererUnknownLanguage::class.java)
        testGetProgrammingLanguageUtil("go", CodeWhispererUnknownLanguage::class.java)
    }

    @Test
    fun `psiFile passed to getProgrammingLanguage(psiFile) returns null`() {
        // psiFile.virtualFile potentially will return null if virtualFile only exist in the memory instead of the disk
        val psiFileMock = mock<PsiFile> {
            on { virtualFile } doReturn null
        }
        assertThat(manager.getLanguage(psiFileMock)).isInstanceOf(CodeWhispererUnknownLanguage::class.java)
    }

    private fun <T : CodeWhispererProgrammingLanguage> testGetProgrammingLanguageUtil(fileTypeName: String, expectedLanguage: Class<T>) {
        val fileTypeMock = mock<FileType> {
            on { name } doReturn fileTypeName
        }
        val vFileMock = mock<VirtualFile> {
            on { fileType } doReturn fileTypeMock
        }
        assertThat(manager.getLanguage(vFileMock)).isInstanceOf(expectedLanguage)
    }
}

class CodeWhispererProgrammingLanguageTest {
    class TestLanguage : CodeWhispererProgrammingLanguage() {
        override val languageId: String = "test-language"
        override fun toTelemetryType(): CodewhispererLanguage = CodewhispererLanguage.Unknown
    }

    @Test
    fun `test language isSupport`() {
        EP_NAME.extensionList.forEach { language ->
            val telemetryType = language.toTelemetryType()
            val shouldSupportAutoCompletion = when (telemetryType) {
                CodewhispererLanguage.Java -> true
                CodewhispererLanguage.Jsx -> true
                CodewhispererLanguage.Javascript -> true
                CodewhispererLanguage.Python -> true
                CodewhispererLanguage.Typescript -> true
                CodewhispererLanguage.Tsx -> true
                CodewhispererLanguage.Csharp -> true
                else -> false
            }

            val shouldSupportSecurityScan = when (telemetryType) {
                CodewhispererLanguage.Java -> true
                CodewhispererLanguage.Python -> true
                else -> false
            }

            assertThat(language.isCodeCompletionSupported()).isEqualTo(shouldSupportAutoCompletion)
            assertThat(language.isCodeScanSupported()).isEqualTo(shouldSupportSecurityScan)
        }
    }

    @Test
    fun `test CodeWhispererProgrammingLanguage isEqual will compare its languageId`() {
        val instance1: CodeWhispererJava = CodeWhispererJava.INSTANCE
        val instance2: CodeWhispererJava
        CodeWhispererJava::class.apply {
            val constructor = primaryConstructor
            constructor?.isAccessible = true
            instance2 = this.createInstance()
        }

        assertThat(instance1).isNotSameAs(instance2)
        assertThat(instance1).isEqualTo(instance2)
    }

    @Test
    fun `test any class extending CodeWhispererProgrammingLanguage isEqual will compare its languageId`() {
        val instance1: TestLanguage
        val instance2: TestLanguage
        TestLanguage::class.apply {
            val constructor = primaryConstructor
            constructor?.isAccessible = true
            instance1 = this.createInstance()
            instance2 = this.createInstance()
        }

        assertThat(instance1).isNotSameAs(instance2)
        assertThat(instance1).isEqualTo(instance2)
    }

    @Test
    fun `test hashCode`() {
        val set = mutableSetOf<CodeWhispererProgrammingLanguage>()
        val instance1 = CodeWhispererJava.INSTANCE
        val instance2: CodeWhispererProgrammingLanguage
        CodeWhispererJava::class.apply {
            val constructor = primaryConstructor
            constructor?.isAccessible = true
            instance2 = this.createInstance()
        }

        set.add(instance1)
        val flag = set.contains(instance2)
        assertThat(flag).isTrue
    }

    private companion object {
        val EP_NAME = ExtensionPointName<CodeWhispererProgrammingLanguage>("aws.toolkit.codewhisperer.programmingLanguage")
    }
}
