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
import software.aws.toolkits.jetbrains.services.codewhisperer.language.CodeWhispererLanguageManager.Companion.languageExtensionsMap
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
        testGetProgrammingLanguageUtil(listOf("java", "Java", "JAVA"), languageExtensionsMap[CodeWhispererJava.INSTANCE], CodeWhispererJava::class.java)
        testGetProgrammingLanguageUtil(listOf("python", "Python"), languageExtensionsMap[CodeWhispererPython.INSTANCE], CodeWhispererPython::class.java)
        testGetProgrammingLanguageUtil(
            listOf("javascript", "JavaScript"),
            languageExtensionsMap[CodeWhispererJavaScript.INSTANCE],
            CodeWhispererJavaScript::class.java
        )
        testGetProgrammingLanguageUtil(listOf("jsx harmony"), languageExtensionsMap[CodeWhispererJsx.INSTANCE], CodeWhispererJsx::class.java)
        testGetProgrammingLanguageUtil(listOf("typescript jsx"), languageExtensionsMap[CodeWhispererTsx.INSTANCE], CodeWhispererTsx::class.java)
        testGetProgrammingLanguageUtil(
            listOf("typescript", "TypeScript"),
            languageExtensionsMap[CodeWhispererTypeScript.INSTANCE],
            CodeWhispererTypeScript::class.java
        )
        testGetProgrammingLanguageUtil(listOf("c#", "C#"), languageExtensionsMap[CodeWhispererCsharp.INSTANCE], CodeWhispererCsharp::class.java)
        testGetProgrammingLanguageUtil(listOf("go", "Go"), languageExtensionsMap[CodeWhispererGo.INSTANCE], CodeWhispererGo::class.java)
        testGetProgrammingLanguageUtil(listOf("kotlin", "Kotlin"), languageExtensionsMap[CodeWhispererKotlin.INSTANCE], CodeWhispererKotlin::class.java)
        testGetProgrammingLanguageUtil(listOf("php", "Php"), languageExtensionsMap[CodeWhispererPhp.INSTANCE], CodeWhispererPhp::class.java)
        testGetProgrammingLanguageUtil(listOf("ruby", "Ruby"), languageExtensionsMap[CodeWhispererRuby.INSTANCE], CodeWhispererRuby::class.java)
        testGetProgrammingLanguageUtil(listOf("scala", "Scala"), languageExtensionsMap[CodeWhispererScala.INSTANCE], CodeWhispererScala::class.java)
        testGetProgrammingLanguageUtil(listOf("sql", "Sql"), languageExtensionsMap[CodeWhispererSql.INSTANCE], CodeWhispererSql::class.java)
        testGetProgrammingLanguageUtil(listOf("plain_text"), languageExtensionsMap[CodeWhispererPlainText.INSTANCE], CodeWhispererPlainText::class.java)
        testGetProgrammingLanguageUtil(listOf("c++"), languageExtensionsMap[CodeWhispererCpp.INSTANCE], CodeWhispererCpp::class.java)
        testGetProgrammingLanguageUtil(listOf("c++"), languageExtensionsMap[CodeWhispererC.INSTANCE], CodeWhispererC::class.java)
        testGetProgrammingLanguageUtil(listOf("Shell Script"), languageExtensionsMap[CodeWhispererShell.INSTANCE], CodeWhispererShell::class.java)
        testGetProgrammingLanguageUtil(listOf("Rust"), languageExtensionsMap[CodeWhispererRust.INSTANCE], CodeWhispererRust::class.java)
    }

    @Test
    fun `psiFile passed to getProgrammingLanguage(psiFile) returns null`() {
        // psiFile.virtualFile potentially will return null if virtualFile only exist in the memory instead of the disk
        val psiFileMock = mock<PsiFile> {
            on { virtualFile } doReturn null
        }
        assertThat(manager.getLanguage(psiFileMock)).isInstanceOf(CodeWhispererUnknownLanguage::class.java)
    }

    private fun <T : CodeWhispererProgrammingLanguage> testGetProgrammingLanguageUtil(
        fileTypeNames: List<String>,
        fileExtensions: List<String>?,
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
