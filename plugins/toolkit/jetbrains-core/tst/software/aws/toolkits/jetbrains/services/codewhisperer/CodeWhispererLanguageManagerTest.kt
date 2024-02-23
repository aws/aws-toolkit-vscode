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
import software.aws.toolkits.jetbrains.services.codewhisperer.language.languages.CodeWhispererC
import software.aws.toolkits.jetbrains.services.codewhisperer.language.languages.CodeWhispererCpp
import software.aws.toolkits.jetbrains.services.codewhisperer.language.languages.CodeWhispererCsharp
import software.aws.toolkits.jetbrains.services.codewhisperer.language.languages.CodeWhispererGo
import software.aws.toolkits.jetbrains.services.codewhisperer.language.languages.CodeWhispererJava
import software.aws.toolkits.jetbrains.services.codewhisperer.language.languages.CodeWhispererJavaScript
import software.aws.toolkits.jetbrains.services.codewhisperer.language.languages.CodeWhispererJsx
import software.aws.toolkits.jetbrains.services.codewhisperer.language.languages.CodeWhispererKotlin
import software.aws.toolkits.jetbrains.services.codewhisperer.language.languages.CodeWhispererPhp
import software.aws.toolkits.jetbrains.services.codewhisperer.language.languages.CodeWhispererPlainText
import software.aws.toolkits.jetbrains.services.codewhisperer.language.languages.CodeWhispererPython
import software.aws.toolkits.jetbrains.services.codewhisperer.language.languages.CodeWhispererRuby
import software.aws.toolkits.jetbrains.services.codewhisperer.language.languages.CodeWhispererRust
import software.aws.toolkits.jetbrains.services.codewhisperer.language.languages.CodeWhispererScala
import software.aws.toolkits.jetbrains.services.codewhisperer.language.languages.CodeWhispererShell
import software.aws.toolkits.jetbrains.services.codewhisperer.language.languages.CodeWhispererSql
import software.aws.toolkits.jetbrains.services.codewhisperer.language.languages.CodeWhispererTsx
import software.aws.toolkits.jetbrains.services.codewhisperer.language.languages.CodeWhispererTypeScript
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
        testGetProgrammingLanguageUtil(listOf("java", "Java", "JAVA"), listOf("java"), CodeWhispererJava::class.java)
        testGetProgrammingLanguageUtil(listOf("python", "Python"), listOf("py"), CodeWhispererPython::class.java)
        testGetProgrammingLanguageUtil(listOf("javascript", "JavaScript"), listOf("js"), CodeWhispererJavaScript::class.java)
        testGetProgrammingLanguageUtil(listOf("jsx harmony"), listOf("jsx"), CodeWhispererJsx::class.java)
        testGetProgrammingLanguageUtil(listOf("typescript jsx"), listOf("tsx"), CodeWhispererTsx::class.java)
        testGetProgrammingLanguageUtil(listOf("typescript", "TypeScript"), listOf("ts"), CodeWhispererTypeScript::class.java)
        testGetProgrammingLanguageUtil(listOf("c#", "C#"), listOf("cs"), CodeWhispererCsharp::class.java)
        testGetProgrammingLanguageUtil(listOf("go", "Go"), listOf("go"), CodeWhispererGo::class.java)
        testGetProgrammingLanguageUtil(listOf("kotlin", "Kotlin"), listOf("kt"), CodeWhispererKotlin::class.java)
        testGetProgrammingLanguageUtil(listOf("php", "Php"), listOf("php"), CodeWhispererPhp::class.java)
        testGetProgrammingLanguageUtil(listOf("ruby", "Ruby"), listOf("rb"), CodeWhispererRuby::class.java)
        testGetProgrammingLanguageUtil(listOf("scala", "Scala"), listOf("scala"), CodeWhispererScala::class.java)
        testGetProgrammingLanguageUtil(listOf("sql", "Sql"), listOf("sql"), CodeWhispererSql::class.java)
        testGetProgrammingLanguageUtil(listOf("plain_text"), listOf("txt"), CodeWhispererPlainText::class.java)
        testGetProgrammingLanguageUtil(listOf("c++"), listOf("cpp", "c++", "cc"), CodeWhispererCpp::class.java)
        testGetProgrammingLanguageUtil(listOf("c"), listOf("c", "h"), CodeWhispererC::class.java)
        testGetProgrammingLanguageUtil(listOf("Shell Script"), listOf("sh"), CodeWhispererShell::class.java)
        testGetProgrammingLanguageUtil(listOf("Rust"), listOf("rs"), CodeWhispererRust::class.java)
    }

    @Test
    fun `psiFile passed to getProgrammingLanguage(psiFile) returns null`() {
        // psiFile.virtualFile potentially will return null if virtualFile only exist in the memory instead of the disk
        val psiFileMock = mock<PsiFile> {
            on { virtualFile } doReturn null
            on { name } doReturn "my_python_script_1.py"
        }
        assertThat(manager.getLanguage(psiFileMock)).isInstanceOf(CodeWhispererPython::class.java)
    }

    private fun <T : CodeWhispererProgrammingLanguage> testGetProgrammingLanguageUtil(
        fileTypeNames: List<String>,
        fileExtensions: List<String?>?,
        expectedLanguage: Class<T>
    ) {
        fileExtensions?.forEach { fileExtension ->
            fileTypeNames.forEach { fileTypeName ->
                val fileTypeMock = mock<FileType> {
                    on { name } doReturn fileTypeName
                }
                val vFileMock = mock<VirtualFile> {
                    on { fileType } doReturn fileTypeMock
                    on { extension } doReturn fileExtension
                }
                assertThat(manager.getLanguage(vFileMock)).isInstanceOf(expectedLanguage)
            }
        }
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
            val shouldSupportAutoCompletion = true

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

    companion object {
        val EP_NAME = ExtensionPointName<CodeWhispererProgrammingLanguage>("aws.toolkit.codewhisperer.programmingLanguage")
    }
}
