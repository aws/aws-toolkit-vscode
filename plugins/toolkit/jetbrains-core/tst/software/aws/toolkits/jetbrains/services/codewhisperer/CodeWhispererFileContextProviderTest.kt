// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.application.runReadAction
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.psi.PsiFile
import com.intellij.testFramework.DisposableRule
import com.intellij.testFramework.fixtures.JavaCodeInsightTestFixture
import com.intellij.testFramework.replaceService
import com.intellij.testFramework.runInEdtAndGet
import com.intellij.testFramework.runInEdtAndWait
import kotlinx.coroutines.runBlocking
import org.assertj.core.api.Assertions.assertThat
import org.junit.Before
import org.junit.Ignore
import org.junit.Rule
import org.junit.Test
import org.mockito.kotlin.any
import org.mockito.kotlin.doReturn
import org.mockito.kotlin.mock
import org.mockito.kotlin.spy
import org.mockito.kotlin.times
import org.mockito.kotlin.verify
import org.mockito.kotlin.whenever
import software.aws.toolkits.jetbrains.services.codewhisperer.language.languages.CodeWhispererCpp
import software.aws.toolkits.jetbrains.services.codewhisperer.language.languages.CodeWhispererCsharp
import software.aws.toolkits.jetbrains.services.codewhisperer.language.languages.CodeWhispererGo
import software.aws.toolkits.jetbrains.services.codewhisperer.language.languages.CodeWhispererJava
import software.aws.toolkits.jetbrains.services.codewhisperer.language.languages.CodeWhispererJavaScript
import software.aws.toolkits.jetbrains.services.codewhisperer.language.languages.CodeWhispererJsx
import software.aws.toolkits.jetbrains.services.codewhisperer.language.languages.CodeWhispererKotlin
import software.aws.toolkits.jetbrains.services.codewhisperer.language.languages.CodeWhispererPython
import software.aws.toolkits.jetbrains.services.codewhisperer.language.languages.CodeWhispererRuby
import software.aws.toolkits.jetbrains.services.codewhisperer.language.languages.CodeWhispererTsx
import software.aws.toolkits.jetbrains.services.codewhisperer.language.languages.CodeWhispererTypeScript
import software.aws.toolkits.jetbrains.services.codewhisperer.service.CodeWhispererUserGroup
import software.aws.toolkits.jetbrains.services.codewhisperer.service.CodeWhispererUserGroupSettings
import software.aws.toolkits.jetbrains.services.codewhisperer.util.CodeWhispererConstants
import software.aws.toolkits.jetbrains.services.codewhisperer.util.DefaultCodeWhispererFileContextProvider
import software.aws.toolkits.jetbrains.services.codewhisperer.util.FileContextProvider
import software.aws.toolkits.jetbrains.utils.rules.HeavyJavaCodeInsightTestFixtureRule
import software.aws.toolkits.jetbrains.utils.rules.addClass
import software.aws.toolkits.jetbrains.utils.rules.addModule
import software.aws.toolkits.jetbrains.utils.rules.addTestClass

class CodeWhispererFileContextProviderTest {
    @JvmField
    @Rule
    val projectRule = HeavyJavaCodeInsightTestFixtureRule()

    @JvmField
    @Rule
    val disposableRule = DisposableRule()

    lateinit var sut: DefaultCodeWhispererFileContextProvider

    lateinit var fixture: JavaCodeInsightTestFixture
    lateinit var project: Project

    @Before
    fun setup() {
        fixture = projectRule.fixture
        project = projectRule.project

        sut = FileContextProvider.getInstance(project) as DefaultCodeWhispererFileContextProvider
    }

    @Test
    fun `crossfile configuration`() {
        val userGroupSetting = mock<CodeWhispererUserGroupSettings>()
        ApplicationManager.getApplication().replaceService(CodeWhispererUserGroupSettings::class.java, userGroupSetting, disposableRule.disposable)

        whenever(userGroupSetting.getUserGroup()).thenReturn(CodeWhispererUserGroup.Control)
        assertThat(CodeWhispererConstants.CrossFile.CHUNK_SIZE).isEqualTo(60)

        whenever(userGroupSetting.getUserGroup()).thenReturn(CodeWhispererUserGroup.CrossFile)
        assertThat(CodeWhispererConstants.CrossFile.CHUNK_SIZE).isEqualTo(60)
    }

    @Test
    fun `shouldFetchUtgContext - fully support`() {
        assertThat(DefaultCodeWhispererFileContextProvider.shouldFetchUtgContext(CodeWhispererJava.INSTANCE, CodeWhispererUserGroup.CrossFile)).isTrue
        assertThat(DefaultCodeWhispererFileContextProvider.shouldFetchUtgContext(CodeWhispererJava.INSTANCE, CodeWhispererUserGroup.Control)).isTrue
    }

    @Test
    fun `shouldFetchUtgContext - partially support`() {
        assertThat(DefaultCodeWhispererFileContextProvider.shouldFetchUtgContext(CodeWhispererPython.INSTANCE, CodeWhispererUserGroup.CrossFile)).isTrue
        assertThat(DefaultCodeWhispererFileContextProvider.shouldFetchUtgContext(CodeWhispererPython.INSTANCE, CodeWhispererUserGroup.Control)).isFalse
    }

    @Test
    fun `shouldFetchUtgContext - no support`() {
        assertThat(DefaultCodeWhispererFileContextProvider.shouldFetchUtgContext(CodeWhispererJavaScript.INSTANCE, CodeWhispererUserGroup.Control)).isNull()
        assertThat(DefaultCodeWhispererFileContextProvider.shouldFetchUtgContext(CodeWhispererJavaScript.INSTANCE, CodeWhispererUserGroup.CrossFile)).isNull()

        assertThat(DefaultCodeWhispererFileContextProvider.shouldFetchUtgContext(CodeWhispererJsx.INSTANCE, CodeWhispererUserGroup.Control)).isNull()
        assertThat(DefaultCodeWhispererFileContextProvider.shouldFetchUtgContext(CodeWhispererJsx.INSTANCE, CodeWhispererUserGroup.CrossFile)).isNull()

        assertThat(DefaultCodeWhispererFileContextProvider.shouldFetchUtgContext(CodeWhispererTypeScript.INSTANCE, CodeWhispererUserGroup.Control)).isNull()
        assertThat(DefaultCodeWhispererFileContextProvider.shouldFetchUtgContext(CodeWhispererTypeScript.INSTANCE, CodeWhispererUserGroup.CrossFile)).isNull()

        assertThat(DefaultCodeWhispererFileContextProvider.shouldFetchUtgContext(CodeWhispererTsx.INSTANCE, CodeWhispererUserGroup.Control)).isNull()
        assertThat(DefaultCodeWhispererFileContextProvider.shouldFetchUtgContext(CodeWhispererTsx.INSTANCE, CodeWhispererUserGroup.CrossFile)).isNull()

        assertThat(DefaultCodeWhispererFileContextProvider.shouldFetchUtgContext(CodeWhispererCsharp.INSTANCE, CodeWhispererUserGroup.Control)).isNull()
        assertThat(DefaultCodeWhispererFileContextProvider.shouldFetchUtgContext(CodeWhispererCsharp.INSTANCE, CodeWhispererUserGroup.CrossFile)).isNull()

        assertThat(DefaultCodeWhispererFileContextProvider.shouldFetchUtgContext(CodeWhispererKotlin.INSTANCE, CodeWhispererUserGroup.Control)).isNull()
        assertThat(DefaultCodeWhispererFileContextProvider.shouldFetchUtgContext(CodeWhispererKotlin.INSTANCE, CodeWhispererUserGroup.CrossFile)).isNull()

        assertThat(DefaultCodeWhispererFileContextProvider.shouldFetchUtgContext(CodeWhispererGo.INSTANCE, CodeWhispererUserGroup.Control)).isNull()
        assertThat(DefaultCodeWhispererFileContextProvider.shouldFetchUtgContext(CodeWhispererGo.INSTANCE, CodeWhispererUserGroup.CrossFile)).isNull()

        assertThat(DefaultCodeWhispererFileContextProvider.shouldFetchUtgContext(CodeWhispererTsx.INSTANCE, CodeWhispererUserGroup.Control)).isNull()
        assertThat(DefaultCodeWhispererFileContextProvider.shouldFetchUtgContext(CodeWhispererTsx.INSTANCE, CodeWhispererUserGroup.CrossFile)).isNull()
    }

    @Test
    fun `shouldFetchCrossfileContext - fully support`() {
        assertThat(DefaultCodeWhispererFileContextProvider.shouldFetchCrossfileContext(CodeWhispererJava.INSTANCE, CodeWhispererUserGroup.CrossFile)).isTrue
        assertThat(DefaultCodeWhispererFileContextProvider.shouldFetchCrossfileContext(CodeWhispererJava.INSTANCE, CodeWhispererUserGroup.Control)).isTrue

        assertThat(DefaultCodeWhispererFileContextProvider.shouldFetchCrossfileContext(CodeWhispererPython.INSTANCE, CodeWhispererUserGroup.CrossFile)).isTrue
        assertThat(DefaultCodeWhispererFileContextProvider.shouldFetchCrossfileContext(CodeWhispererPython.INSTANCE, CodeWhispererUserGroup.Control)).isTrue

        assertThat(
            DefaultCodeWhispererFileContextProvider.shouldFetchCrossfileContext(
                CodeWhispererJavaScript.INSTANCE,
                CodeWhispererUserGroup.CrossFile
            )
        ).isTrue
        assertThat(DefaultCodeWhispererFileContextProvider.shouldFetchCrossfileContext(CodeWhispererJavaScript.INSTANCE, CodeWhispererUserGroup.Control)).isTrue

        assertThat(DefaultCodeWhispererFileContextProvider.shouldFetchCrossfileContext(CodeWhispererJsx.INSTANCE, CodeWhispererUserGroup.CrossFile)).isTrue
        assertThat(DefaultCodeWhispererFileContextProvider.shouldFetchCrossfileContext(CodeWhispererJsx.INSTANCE, CodeWhispererUserGroup.Control)).isTrue

        assertThat(
            DefaultCodeWhispererFileContextProvider.shouldFetchCrossfileContext(
                CodeWhispererTypeScript.INSTANCE,
                CodeWhispererUserGroup.CrossFile
            )
        ).isTrue
        assertThat(DefaultCodeWhispererFileContextProvider.shouldFetchCrossfileContext(CodeWhispererTypeScript.INSTANCE, CodeWhispererUserGroup.Control)).isTrue

        assertThat(DefaultCodeWhispererFileContextProvider.shouldFetchCrossfileContext(CodeWhispererTsx.INSTANCE, CodeWhispererUserGroup.CrossFile)).isTrue
        assertThat(DefaultCodeWhispererFileContextProvider.shouldFetchCrossfileContext(CodeWhispererTsx.INSTANCE, CodeWhispererUserGroup.Control)).isTrue
    }

    @Ignore("Reenable this once we have any partial support language")
    @Test
    fun `shouldFetchCrossfileContext - partially support`() {
        assertThat(DefaultCodeWhispererFileContextProvider.shouldFetchCrossfileContext(CodeWhispererPython.INSTANCE, CodeWhispererUserGroup.Control)).isFalse
        assertThat(DefaultCodeWhispererFileContextProvider.shouldFetchCrossfileContext(CodeWhispererPython.INSTANCE, CodeWhispererUserGroup.CrossFile)).isTrue
    }

    @Test
    fun `shouldFetchCrossfileContext - no support`() {
        assertThat(DefaultCodeWhispererFileContextProvider.shouldFetchCrossfileContext(CodeWhispererCsharp.INSTANCE, CodeWhispererUserGroup.Control)).isNull()
        assertThat(DefaultCodeWhispererFileContextProvider.shouldFetchCrossfileContext(CodeWhispererCsharp.INSTANCE, CodeWhispererUserGroup.CrossFile)).isNull()

        assertThat(DefaultCodeWhispererFileContextProvider.shouldFetchCrossfileContext(CodeWhispererKotlin.INSTANCE, CodeWhispererUserGroup.Control)).isNull()
        assertThat(DefaultCodeWhispererFileContextProvider.shouldFetchCrossfileContext(CodeWhispererKotlin.INSTANCE, CodeWhispererUserGroup.CrossFile)).isNull()

        assertThat(DefaultCodeWhispererFileContextProvider.shouldFetchCrossfileContext(CodeWhispererGo.INSTANCE, CodeWhispererUserGroup.Control)).isNull()
        assertThat(DefaultCodeWhispererFileContextProvider.shouldFetchCrossfileContext(CodeWhispererGo.INSTANCE, CodeWhispererUserGroup.CrossFile)).isNull()

        assertThat(DefaultCodeWhispererFileContextProvider.shouldFetchCrossfileContext(CodeWhispererCpp.INSTANCE, CodeWhispererUserGroup.Control)).isNull()
        assertThat(DefaultCodeWhispererFileContextProvider.shouldFetchCrossfileContext(CodeWhispererCpp.INSTANCE, CodeWhispererUserGroup.CrossFile)).isNull()

        assertThat(DefaultCodeWhispererFileContextProvider.shouldFetchCrossfileContext(CodeWhispererRuby.INSTANCE, CodeWhispererUserGroup.Control)).isNull()
        assertThat(DefaultCodeWhispererFileContextProvider.shouldFetchCrossfileContext(CodeWhispererRuby.INSTANCE, CodeWhispererUserGroup.CrossFile)).isNull()
    }

    @Test
    fun `languages not supporting supplemental context will return empty`() {
        val psiFiles = setupFixture(fixture)
        val psi = psiFiles[0]

        runBlocking {
            var context = aFileContextInfo(CodeWhispererCsharp.INSTANCE)

            assertThat(sut.extractSupplementalFileContextForSrc(psi, context).contents).isEmpty()
            assertThat(sut.extractSupplementalFileContextForTst(psi, context).contents).isEmpty()

            context = aFileContextInfo(CodeWhispererKotlin.INSTANCE)
            assertThat(sut.extractSupplementalFileContextForSrc(psi, context).contents).isEmpty()
            assertThat(sut.extractSupplementalFileContextForTst(psi, context).contents).isEmpty()
        }
    }

    @Test
    fun `extractFileContext should return correct strings`() {
        val src = """
            public class Main {
                public static void main() {
                    System.out.println("Hello world");
                }
            }
        """.trimIndent()
        val psiFile = fixture.configureByText("Main.java", src)

        val fileContext = runInEdtAndGet {
            fixture.editor.caretModel.moveToOffset(47)
            assertThat(fixture.editor.document.text.substring(0, 47)).isEqualTo(
                """
                  public class Main {
                      public static void main
                """.trimIndent()
            )

            assertThat(fixture.editor.document.text.substring(47)).isEqualTo(
                """
                    () {
                            System.out.println("Hello world");
                        }
                    }
                """.trimIndent()
            )

            sut.extractFileContext(fixture.editor, psiFile)
        }

        assertThat(fileContext.filename).isEqualTo("Main.java")
        assertThat(fileContext.programmingLanguage).isEqualTo(CodeWhispererJava.INSTANCE)
        assertThat(fileContext.caretContext.leftFileContext).isEqualTo(
            """
                public class Main {
                    public static void main
            """.trimIndent()
        )
        assertThat(fileContext.caretContext.rightFileContext).isEqualTo(
            """
                () {
                        System.out.println("Hello world");
                    }
                }
            """.trimIndent()
        )
        assertThat(fileContext.caretContext.leftContextOnCurrentLine).isEqualTo("    public static void main")
    }

    @Test
    fun `test extractCodeChunksFromFiles should read files from file producers to get 60 chunks`() {
        val psiFiles = setupFixture(fixture)
        val virtualFiles = psiFiles.mapNotNull { it.virtualFile }
        val javaMainPsiFile = psiFiles.first()

        val fileProducer1: suspend (PsiFile) -> List<VirtualFile> = { psiFile ->
            listOf(virtualFiles[1])
        }

        val fileProducer2: suspend (PsiFile) -> List<VirtualFile> = { psiFile ->
            listOf(virtualFiles[2])
        }

        val result = runBlocking {
            sut.extractCodeChunksFromFiles(javaMainPsiFile, listOf(fileProducer1, fileProducer2))
        }

        assertThat(result[0].content).isEqualTo(
            """public class UtilClass {
            |    public static int util() {};
            |    public static String util2() {};
            """.trimMargin()
        )

        assertThat(result[1].content).isEqualTo(
            """public class UtilClass {
            |    public static int util() {};
            |    public static String util2() {};
            |    private static void helper() {};
            |    public static final int constant1;
            |    public static final int constant2;
            |    public static final int constant3;
            |}
            """.trimMargin()
        )

        assertThat(result[2].content).isEqualTo(
            """public class MyController {
            |    @Get
            |    public Response getRecommendation(Request: req) {}
            """.trimMargin()
        )

        assertThat(result[3].content).isEqualTo(
            """public class MyController {
            |    @Get
            |    public Response getRecommendation(Request: req) {}            
            |}
            """.trimMargin()
        )
    }

    /**
     * - src/
     *     - java/
     *          - Main.java
     *          - Util.java
     *          - controllers/
     *              -MyApiController.java
     * - tst/
     *     - java/
     *          - MainTest.java
     *
     */
    // TODO: fix this test, in test env, psiFile.virtualFile == null @psiGist.getFileData(psiFile) { psiFile -> ... }
    @Ignore
    @Test
    fun `extractSupplementalFileContext from src file should extract src`() {
        val psiFiles = setupFixture(fixture)
        sut = spy(sut)

        runReadAction {
            val fileContext = sut.extractFileContext(fixture.editor, psiFiles[0])

            val supplementalContext = runBlocking { sut.extractSupplementalFileContext(psiFiles[0], fileContext) }
            assertThat(supplementalContext?.contents).isNotNull.isNotEmpty
        }

        runBlocking {
            verify(sut).extractSupplementalFileContextForSrc(any(), any())
            verify(sut, times(0)).extractSupplementalFileContextForTst(any(), any())
        }
    }

    /**
     * - src/
     *     - java/
     *          - Main.java
     *          - Util.java
     *          - controllers/
     *              -MyApiController.java
     * - tst/
     *     - java/
     *          - MainTest.java
     *
     */
    @Test
    fun `extractSupplementalFileContext from tst file should extract focal file`() {
        ApplicationManager.getApplication().replaceService(
            CodeWhispererUserGroupSettings::class.java,
            mock { on { getUserGroup() } doReturn CodeWhispererUserGroup.CrossFile },
            disposableRule.disposable
        )
        val module = fixture.addModule("main")
        fixture.addClass(module, JAVA_MAIN)

        val psiTestClass = fixture.addTestClass(
            module,
            """
            public class MainTest {}
            """
        )

        val tstFile = psiTestClass.containingFile

        sut = spy(sut)

        runReadAction {
            val fileContext = aFileContextInfo(CodeWhispererJava.INSTANCE)
            val supplementalContext = runBlocking {
                sut.extractSupplementalFileContext(tstFile, fileContext)
            }
            assertThat(supplementalContext?.contents)
                .isNotNull
                .isNotEmpty
                .hasSize(1)

            assertThat(supplementalContext?.contents?.get(0)?.content)
                .isNotNull
                .isEqualTo("UTG\n$JAVA_MAIN")
        }

        runBlocking {
            verify(sut, times(0)).extractSupplementalFileContextForSrc(any(), any())
            verify(sut).extractSupplementalFileContextForTst(any(), any())
        }
    }

    private fun setupFixture(fixture: JavaCodeInsightTestFixture): List<PsiFile> {
        val psiFile1 = fixture.addFileToProject("Main.java", JAVA_MAIN)
        val psiFile2 = fixture.addFileToProject("UtilClass.java", JAVA_UTILCLASS)
        val psiFile3 = fixture.addFileToProject("controllers/MyController.java", JAVA_MY_CROLLTER)
        val psiFile4 = fixture.addFileToProject("helpers/Helper1.java", "Class Helper1 {}")
        val psiFile5 = fixture.addFileToProject("helpers/Helper2.java", "Class Helper2 {}")
        val psiFile6 = fixture.addFileToProject("helpers/Helper3.java", "Class Helper3 {}")
        val testPsiFile = fixture.addFileToProject(
            "test/java/MainTest.java",
            """
            public class MainTest {
                @Before
                public void setup() {}
            }
            """.trimIndent()
        )

        runInEdtAndWait {
            fixture.openFileInEditor(psiFile1.virtualFile)
            fixture.editor.caretModel.moveToOffset(fixture.editor.document.textLength)
        }

        return listOf(psiFile1, psiFile2, psiFile3, testPsiFile, psiFile4, psiFile5, psiFile6)
    }

    companion object {
        private val JAVA_MAIN = """public class Main {
            |    public static void main() {
            |        System.out.println("Hello world");               
            |    }
            |}
        """.trimMargin()

        private val JAVA_UTILCLASS = """public class UtilClass {
            |    public static int util() {};
            |    public static String util2() {};
            |    private static void helper() {};
            |    public static final int constant1;
            |    public static final int constant2;
            |    public static final int constant3;
            |}
        """.trimMargin()

        private val JAVA_MY_CROLLTER = """public class MyController {
            |    @Get
            |    public Response getRecommendation(Request: req) {}            
            |}
        """.trimMargin()
    }
}
