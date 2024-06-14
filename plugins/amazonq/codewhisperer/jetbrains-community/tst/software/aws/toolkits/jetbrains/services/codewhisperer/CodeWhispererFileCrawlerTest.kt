// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer

import com.intellij.openapi.application.runReadAction
import com.intellij.openapi.editor.EditorFactory
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.psi.PsiFile
import com.intellij.testFramework.fixtures.CodeInsightTestFixture
import com.intellij.testFramework.runInEdtAndWait
import kotlinx.coroutines.runBlocking
import org.assertj.core.api.Assertions.assertThat
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import software.aws.toolkits.core.utils.test.aString
import software.aws.toolkits.jetbrains.services.codewhisperer.util.CodeWhispererFileCrawler
import software.aws.toolkits.jetbrains.services.codewhisperer.util.FileCrawler
import software.aws.toolkits.jetbrains.services.codewhisperer.util.JavaCodeWhispererFileCrawler
import software.aws.toolkits.jetbrains.services.codewhisperer.util.JavascriptCodeWhispererFileCrawler
import software.aws.toolkits.jetbrains.services.codewhisperer.util.PythonCodeWhispererFileCrawler
import software.aws.toolkits.jetbrains.services.codewhisperer.util.TypescriptCodeWhispererFileCrawler
import software.aws.toolkits.jetbrains.services.codewhisperer.util.UtgStrategy
import software.aws.toolkits.jetbrains.services.codewhisperer.util.content
import software.aws.toolkits.jetbrains.utils.rules.CodeInsightTestFixtureRule
import software.aws.toolkits.jetbrains.utils.rules.JavaCodeInsightTestFixtureRule
import software.aws.toolkits.jetbrains.utils.rules.PythonCodeInsightTestFixtureRule

// TODO: Make different language file crawler different files and move to language/ folder
class CodeWhispererFileCrawlerTest {
    @JvmField
    @Rule
    val projectRule: CodeInsightTestFixtureRule = CodeInsightTestFixtureRule()

    lateinit var sut: CodeWhispererFileCrawler

    lateinit var fixture: CodeInsightTestFixture
    lateinit var project: Project

    @Before
    fun setup() {
        fixture = projectRule.fixture
        project = projectRule.project
    }

    @Test
    fun `searchRelevantFileInEditors should exclude target file itself and files with different file extension`() {
        val targetFile = fixture.addFileToProject("Foo.java", "I have 10 Foo in total, Foo, Foo, Foo, Foo, Foo, Foo, Foo, Foo, Foo")

        val file0 = fixture.addFileToProject("file0.py", "I have 7 Foo, Foo, Foo, Foo, Foo, Foo, Foo, but I am a pyfile")
        val file1 = fixture.addFileToProject("File1.java", "I have 4 Foo key words : Foo, Foo, Foo")
        val file2 = fixture.addFileToProject("File2.java", "I have 2 Foo Foo")
        val file3 = fixture.addFileToProject("File3.java", "I have only 1 Foo")
        val file4 = fixture.addFileToProject("File4.java", "bar bar bar, i have a lot of bar")

        runInEdtAndWait {
            fixture.openFileInEditor(targetFile.virtualFile)
            fixture.openFileInEditor(file0.virtualFile)
            fixture.openFileInEditor(file1.virtualFile)
            fixture.openFileInEditor(file2.virtualFile)
            fixture.openFileInEditor(file3.virtualFile)
            fixture.openFileInEditor(file4.virtualFile)
        }

        listOf(
            JavaCodeWhispererFileCrawler,
            PythonCodeWhispererFileCrawler,
            TypescriptCodeWhispererFileCrawler,
            JavascriptCodeWhispererFileCrawler
        ).forEach {
            sut = it

            val result = CodeWhispererFileCrawler.searchRelevantFileInEditors(targetFile) { psiFile ->
                psiFile.virtualFile.content().split(" ")
            }
            assertThat(result).isEqualTo(file1.virtualFile)
        }
    }

    @Test
    fun `searchKeywordsInOpenedFile is language agnostic`() {
        sut = JavaCodeWhispererFileCrawler

        val targetFile = fixture.addFileToProject("Foo.ts", "I have 10 Foo in total, Foo, Foo, Foo, Foo, Foo, Foo, Foo, Foo, Foo")

        val file0 = fixture.addFileToProject("file0.java", "I have 7 Foo, Foo, Foo, Foo, Foo, Foo, Foo, but I am a pyfile")
        val file1 = fixture.addFileToProject("File1.ts", "I have 4 Foo key words : Foo, Foo, Foo")
        val file2 = fixture.addFileToProject("File2.ts", "I have 2 Foo Foo")
        val file3 = fixture.addFileToProject("File3.ts", "I have only 1 Foo")
        val file4 = fixture.addFileToProject("File4.ts", "bar bar bar, i have a lot of bar")

        runInEdtAndWait {
            fixture.openFileInEditor(targetFile.virtualFile)
            fixture.openFileInEditor(file0.virtualFile)
            fixture.openFileInEditor(file1.virtualFile)
            fixture.openFileInEditor(file2.virtualFile)
            fixture.openFileInEditor(file3.virtualFile)
            fixture.openFileInEditor(file4.virtualFile)
        }

        listOf(
            JavaCodeWhispererFileCrawler,
            PythonCodeWhispererFileCrawler,
            TypescriptCodeWhispererFileCrawler,
            JavascriptCodeWhispererFileCrawler
        ).forEach {
            sut = it

            val result = CodeWhispererFileCrawler.searchRelevantFileInEditors(targetFile) { psiFile ->
                psiFile.virtualFile.content().split(" ")
            }
            assertThat(result).isEqualTo(file1.virtualFile)
        }
    }
}

class JavaCodeWhispererFileCrawlerTest {
    @Rule
    @JvmField
    val projectRule: CodeInsightTestFixtureRule = JavaCodeInsightTestFixtureRule()

    lateinit var sut: CodeWhispererFileCrawler

    lateinit var project: Project
    lateinit var fixture: CodeInsightTestFixture

    @Before
    fun setup() {
        sut = JavaCodeWhispererFileCrawler

        project = projectRule.project
        fixture = projectRule.fixture
    }

    @Test
    fun getFileDistance() {
        val targetFile = fixture.addFileToProject("service/microService/CodeWhispererFileContextProvider.java", aString())

        val fileWithDistance0 = fixture.addFileToProject("service/microService/CodeWhispererFileCrawler.java", aString())
        val fileWithDistance1 = fixture.addFileToProject("service/CodewhispererRecommendationService.java", aString())
        val fileWithDistance3 = fixture.addFileToProject("util/CodeWhispererConstants.java", aString())
        val fileWithDistance4 = fixture.addFileToProject("ui/popup/CodeWhispererPopupManager.java", aString())
        val fileWithDistance5 = fixture.addFileToProject("ui/popup/components/CodeWhispererPopup.java", aString())
        val fileWithDistance6 = fixture.addFileToProject("ui/popup/components/actions/AcceptRecommendationAction.java", aString())

        assertThat(CodeWhispererFileCrawler.getFileDistance(targetFile.virtualFile, fileWithDistance0.virtualFile))
            .isEqualTo(0)

        assertThat(CodeWhispererFileCrawler.getFileDistance(targetFile.virtualFile, fileWithDistance1.virtualFile))
            .isEqualTo(1)

        assertThat(CodeWhispererFileCrawler.getFileDistance(targetFile.virtualFile, fileWithDistance3.virtualFile))
            .isEqualTo(3)

        assertThat(CodeWhispererFileCrawler.getFileDistance(targetFile.virtualFile, fileWithDistance4.virtualFile))
            .isEqualTo(4)

        assertThat(CodeWhispererFileCrawler.getFileDistance(targetFile.virtualFile, fileWithDistance5.virtualFile))
            .isEqualTo(5)

        assertThat(CodeWhispererFileCrawler.getFileDistance(targetFile.virtualFile, fileWithDistance6.virtualFile))
            .isEqualTo(6)
    }

    @Test
    fun `isTest - should return false`() {
        val file1 = fixture.addFileToProject("src/utils/Foo.java", "")
        assertThat(sut.isTestFile(file1.virtualFile, project)).isFalse

        val file2 = fixture.addFileToProject("src/controler/Bar.java", "")
        assertThat(sut.isTestFile(file2.virtualFile, project)).isFalse

        val file3 = fixture.addFileToProject("Main.java", "")
        assertThat(sut.isTestFile(file3.virtualFile, project)).isFalse

        val file4 = fixture.addFileToProject("component/dto/Boo.java", "")
        assertThat(sut.isTestFile(file4.virtualFile, project)).isFalse
    }

    @Test
    fun `isTest - should return true`() {
        val file1 = fixture.addFileToProject("tst/components/Foo.java", "")
        assertThat(sut.isTestFile(file1.virtualFile, project)).isTrue

        val file2 = fixture.addFileToProject("test/components/Foo.java", "")
        assertThat(sut.isTestFile(file2.virtualFile, project)).isTrue

        val file3 = fixture.addFileToProject("tests/components/Foo.java", "")
        assertThat(sut.isTestFile(file3.virtualFile, project)).isTrue

        val file4 = fixture.addFileToProject("FooTest.java", "")
        assertThat(sut.isTestFile(file4.virtualFile, project)).isTrue

        val file5 = fixture.addFileToProject("src/tst/services/FooServiceTest.java", "")
        assertThat(sut.isTestFile(file5.virtualFile, project)).isTrue

        val file6 = fixture.addFileToProject("test/services/BarServiceTest.java", "")
        assertThat(sut.isTestFile(file6.virtualFile, project)).isTrue

        val file7 = fixture.addFileToProject("FooTests.java", "")
        assertThat(sut.isTestFile(file7.virtualFile, project)).isTrue
    }

    @Test
    fun listCrossFileCandidate() {
        val recommendationServiceFile = fixture.addFileToProject("service/CodewhispererRecommendationService.java", aString())
        val fileContextProviderFile = fixture.addFileToProject("service/microService/CodeWhispererFileContextProvider.java", aString())
        val constantFile = fixture.addFileToProject("util/CodeWhispererConstants.java", aString())
        val popupManagerFile = fixture.addFileToProject("ui/popup/CodeWhispererPopupManager.java", aString())
        val popupFile = fixture.addFileToProject("ui/popup/components/CodeWhispererPopup.java", aString())
        val popupActionFile = fixture.addFileToProject("ui/popup/components/actions/AcceptRecommendationAction.java", aString())

        val files = listOf(recommendationServiceFile, fileContextProviderFile, constantFile, popupManagerFile, popupFile, popupActionFile)

        files.shuffled().forEach {
            runInEdtAndWait {
                fixture.openFileInEditor(it.virtualFile)
            }
        }

        val actual = sut.listCrossFileCandidate(fileContextProviderFile)
        assertThat(actual).isEqualTo(
            listOf(
                recommendationServiceFile.virtualFile,
                constantFile.virtualFile,
                popupManagerFile.virtualFile,
                popupFile.virtualFile,
                popupActionFile.virtualFile
            )
        )
    }

    @Test
    fun findFilesUnderProjectRoot() {
        val mainClass = fixture.addFileToProject("Main.java", "")
        val controllerClass = fixture.addFileToProject("service/controllers/MyController.java", "")
        val anotherClass = fixture.addFileToProject("/utils/AnotherClass.java", "")
        val notImportedClass = fixture.addFileToProject("/utils/NotImported.java", "")
        val notImportedClass2 = fixture.addFileToProject("/utils/NotImported2.java", "")

        runReadAction {
            val actual = sut.listFilesUnderProjectRoot(project)
            val expected = listOf<PsiFile>(mainClass, controllerClass, anotherClass, notImportedClass, notImportedClass2)
                .map { it.virtualFile }
                .toSet()

            assertThat(actual).hasSize(expected.size)
            actual.forEach {
                assertThat(expected.contains(it)).isTrue
            }
        }
    }

    @Test
    fun `listFilesWithinSamePackage`() {
        val targetFile = fixture.addFileToProject("/utils/AnotherClass.java", "")
        val file2Package1 = fixture.addFileToProject("/utils/NotImported.java", "")
        val file3Package1 = fixture.addFileToProject("/utils/NotImported2.java", "")
        fixture.addFileToProject("Main.java", "")
        fixture.addFileToProject("service/controllers/MyController.java", "")

        runReadAction {
            val actual = sut.listFilesWithinSamePackage(targetFile)
            val expected = listOf<PsiFile>(file2Package1, file3Package1)
                .map { it.virtualFile }
                .toSet()

            assertThat(actual).hasSize(expected.size)
            actual.forEach {
                assertThat(expected.contains(it)).isTrue
            }
        }
    }

    @Test
    fun `findFilesImported`() {
        val mainClass = fixture.addFileToProject(
            "Main.java",
            """
            package com.cw.file_crawler_test;
            
            import java.util.Map;
            import java.util.regex.Pattern;
            
            import com.cw.file_crawler_test.utils.AnotherClass;
            import com.cw.file_crawler_test.service.controllers.MyController;
            
            public class Main {
            };
            """.trimIndent()
        )

        val controllerClass = fixture.addFileToProject(
            "service/controllers/MyController.java",
            """
                package com.cw.file_crawler_test.service.controllers;
                
                public class MyController {}
            """.trimIndent()
        )

        val anotherClass = fixture.addFileToProject(
            "/utils/AnotherClass.java",
            """
                package com.cw.file_crawler_test.utils;
                
                public class AnotherClass {}
            """.trimIndent()
        )

        fun assertCrawlerFindCorrectFiles(sut: CodeWhispererFileCrawler) {
            runReadAction {
                val expected = setOf<VirtualFile>(controllerClass.virtualFile, anotherClass.virtualFile)
                val actualFiles = runBlocking { sut.listFilesImported(mainClass) }

                assertThat(actualFiles).hasSize(2)
                actualFiles.forEach {
                    assertThat(expected).contains(it)
                }
            }
        }

        assertCrawlerFindCorrectFiles(JavaCodeWhispererFileCrawler)
        // can't make it work right since the temp file created is not in the real file system
        // Naive crawler will actually read the file system thun unable to find files
        //        assertCrawlerFindCorrectFiles(NaiveJavaCodeWhispererFileCrawler(project))
    }

    @Test
    fun `listUtgCandidate by name`() {
        val mainPsi = fixture.addFileToProject("Main.java", aString())
        fixture.addFileToProject("Class1.java", aString())
        fixture.addFileToProject("Class2.java", aString())
        fixture.addFileToProject("Class3.java", aString())
        val tstPsi = fixture.addFileToProject("/tst/java/MainTest.java", aString())

        fun assertCrawlerFindCorrectFiles(sut: FileCrawler) {
            runInEdtAndWait {
                fixture.openFileInEditor(tstPsi.virtualFile)

                val actual = sut.listUtgCandidate(tstPsi)

                assertThat(actual.vfile).isNotNull.isEqualTo(mainPsi.virtualFile)
                assertThat(actual.strategy).isNotNull.isEqualTo(UtgStrategy.ByName)
            }
        }

        assertCrawlerFindCorrectFiles(JavaCodeWhispererFileCrawler)
    }

    @Test
    fun `listUtgCandidate by content`() {
        val mainPsi = fixture.addFileToProject(
            "Main.java",
            """
            public class Main {
                public static void main () {
                    runApp()                    
                }
                
                public void runApp() {
                    // TODO
                }
            }
            """.trimIndent()
        )
        val file1 = fixture.addFileToProject("Class1.java", "trivial string 1")
        val file2 = fixture.addFileToProject("Class2.java", "trivial string 2")
        val file3 = fixture.addFileToProject("Class3.java", "trivial string 3")
        val tstPsi = fixture.addFileToProject(
            "/tst/java/MainTestNotFollowingNamingConvention.java",
            """
            public class MainTest {
                public void testRunApp() {
                    sut.runApp()
                }
            }
            """.trimIndent()
        )

        runInEdtAndWait {
            fixture.openFileInEditor(mainPsi.virtualFile)
            fixture.openFileInEditor(file1.virtualFile)
            fixture.openFileInEditor(file2.virtualFile)
            fixture.openFileInEditor(file3.virtualFile)
            fixture.openFileInEditor(tstPsi.virtualFile)
        }

        runInEdtAndWait {
            val openedFiles = EditorFactory.getInstance().allEditors.size

            val actual = sut.listUtgCandidate(tstPsi)

            assertThat(openedFiles).isEqualTo(5)
            assertThat(actual.vfile).isNotNull.isEqualTo(mainPsi.virtualFile)
            assertThat(actual.strategy).isNotNull.isEqualTo(UtgStrategy.ByContent)
        }
    }

    @Test
    fun `test util countSubstringMatches`() {
        val elementsToCheck = listOf("apple", "pineapple", "banana", "chocolate", "fries", "laptop", "amazon", "codewhisperer", "aws")
        val targetElements = listOf(
            "an apple a day, keep doctors away",
            "codewhisperer is the best AI code generator",
            "chocolateCake",
            "green apple is sour",
            "pineapple juice",
            "chocolate cake is good"
        )

        val actual = CodeWhispererFileCrawler.countSubstringMatches(targetElements, elementsToCheck)
        assertThat(actual).isEqualTo(4)
    }

    @Test
    fun `guessSourceFileName java`() {
        val sut = JavaCodeWhispererFileCrawler

        assertThat(sut.guessSourceFileName("FooTest.java")).isEqualTo("Foo.java")
        assertThat(sut.guessSourceFileName("FooBarTest.java")).isEqualTo("FooBar.java")
        assertThat(sut.guessSourceFileName("Foo.java")).isNull()
        assertThat(sut.guessSourceFileName("FooBar.java")).isNull()
    }
}

class PythonCodeWhispererFileCrawlerTest {
    @JvmField
    @Rule
    val projectRule: CodeInsightTestFixtureRule = PythonCodeInsightTestFixtureRule()

    lateinit var sut: CodeWhispererFileCrawler

    lateinit var project: Project
    lateinit var fixture: CodeInsightTestFixture

    @Before
    fun setup() {
        sut = PythonCodeWhispererFileCrawler

        project = projectRule.project
        fixture = projectRule.fixture
    }

    @Test
    fun `isTest - should return false`() {
        val file1 = fixture.addFileToProject("src/utils/foo.py", "")
        assertThat(sut.isTestFile(file1.virtualFile, project)).isFalse

        val file2 = fixture.addFileToProject("src/controler/bar.py", "")
        assertThat(sut.isTestFile(file2.virtualFile, project)).isFalse

        val file3 = fixture.addFileToProject("main.py", "")
        assertThat(sut.isTestFile(file3.virtualFile, project)).isFalse

        val file4 = fixture.addFileToProject("component/dto/boo.py", "")
        assertThat(sut.isTestFile(file4.virtualFile, project)).isFalse
    }

    @Test
    fun `isTest - should return true`() {
        val file1 = fixture.addFileToProject("tst/components/foo.py", "")
        assertThat(sut.isTestFile(file1.virtualFile, project)).isTrue

        val file2 = fixture.addFileToProject("test/components/foo.py", "")
        assertThat(sut.isTestFile(file2.virtualFile, project)).isTrue

        val file3 = fixture.addFileToProject("tests/components/foo.py", "")
        assertThat(sut.isTestFile(file3.virtualFile, project)).isTrue

        val file4 = fixture.addFileToProject("foo_test.py", "")
        assertThat(sut.isTestFile(file4.virtualFile, project)).isTrue

        val file5 = fixture.addFileToProject("test_foo.py", "")
        assertThat(sut.isTestFile(file5.virtualFile, project)).isTrue

        val file6 = fixture.addFileToProject("src/tst/services/foo_service_test.py", "")
        assertThat(sut.isTestFile(file6.virtualFile, project)).isTrue

        val file7 = fixture.addFileToProject("tests/services/test_bar_service.py", "")
        assertThat(sut.isTestFile(file7.virtualFile, project)).isTrue
    }

    @Test
    fun `listUtgCandidate by name`() {
        val mainPsi = fixture.addFileToProject("main.py", aString())
        fixture.addFileToProject("another_class.py", aString())
        fixture.addFileToProject("class2.py", aString())
        fixture.addFileToProject("class3.py", aString())
        val tstPsi = fixture.addFileToProject("/test/test_main.py", aString())

        runInEdtAndWait {
            fixture.openFileInEditor(tstPsi.virtualFile)
            val actual = sut.listUtgCandidate(tstPsi)
            assertThat(actual.vfile).isNotNull.isEqualTo(mainPsi.virtualFile)
            assertThat(actual.strategy).isNotNull.isEqualTo(UtgStrategy.ByName)
        }
    }

    @Test
    fun `listUtgCandidate by content`() {
        val mainPsi = fixture.addFileToProject(
            "main.py",
            """
            def add(num1, num2):
                return num1 + num2
                
            if __name__ == 'main':
                
            """.trimIndent()
        )
        val file1 = fixture.addFileToProject("Class1.java", "trivial string 1")
        val file2 = fixture.addFileToProject("Class2.java", "trivial string 2")
        val file3 = fixture.addFileToProject("Class3.java", "trivial string 3")
        val tstPsi = fixture.addFileToProject(
            "/test/main_test_not_following_naming_convention.py",
            """
            class TestClass(unittest.TestCase):
                def test_add_numbers(self):
                    result = add(1, 2)
                    self.assertEqual(result, 8, "")
            """.trimIndent()
        )

        runInEdtAndWait {
            fixture.openFileInEditor(mainPsi.virtualFile)
            fixture.openFileInEditor(file1.virtualFile)
            fixture.openFileInEditor(file2.virtualFile)
            fixture.openFileInEditor(file3.virtualFile)
            fixture.openFileInEditor(tstPsi.virtualFile)
        }

        runInEdtAndWait {
            val openedFiles = EditorFactory.getInstance().allEditors.size

            val actual = sut.listUtgCandidate(tstPsi)

            assertThat(openedFiles).isEqualTo(5)
            assertThat(actual.vfile).isNotNull.isEqualTo(mainPsi.virtualFile)
            assertThat(actual.strategy).isNotNull.isEqualTo(UtgStrategy.ByContent)
        }
    }

    @Test
    fun `guessSourceFileName python`() {
        val sut = PythonCodeWhispererFileCrawler

        assertThat(sut.guessSourceFileName("test_foo_bar.py")).isEqualTo("foo_bar.py")
        assertThat(sut.guessSourceFileName("test_foo.py")).isEqualTo("foo.py")
        assertThat(sut.guessSourceFileName("foo_test.py")).isEqualTo("foo.py")
        assertThat(sut.guessSourceFileName("foo_test.py")).isEqualTo("foo.py")
        assertThat(sut.guessSourceFileName("foo_bar_no_idea.py")).isNull()
    }
}

class JsCodeWhispererFileCrawlerTest {
    @JvmField
    @Rule
    val projectRule: CodeInsightTestFixtureRule = CodeInsightTestFixtureRule()

    lateinit var fixture: CodeInsightTestFixture
    lateinit var project: Project

    lateinit var sut: CodeWhispererFileCrawler

    @Before
    fun setup() {
        sut = JavascriptCodeWhispererFileCrawler

        project = projectRule.project
        fixture = projectRule.fixture
    }

    @Test
    fun `isTest - should return false`() {
        val file1 = fixture.addFileToProject("src/utils/foo.js", "")
        assertThat(sut.isTestFile(file1.virtualFile, project)).isFalse

        val file2 = fixture.addFileToProject("src/controler/bar.jsx", "")
        assertThat(sut.isTestFile(file2.virtualFile, project)).isFalse

        val file3 = fixture.addFileToProject("main.js", "")
        assertThat(sut.isTestFile(file3.virtualFile, project)).isFalse

        val file4 = fixture.addFileToProject("component/dto/boo.jsx", "")
        assertThat(sut.isTestFile(file4.virtualFile, project)).isFalse
    }

    @Test
    fun `isTest - should return true`() {
        val file1 = fixture.addFileToProject("tst/components/foo.test.js", "")
        assertThat(sut.isTestFile(file1.virtualFile, project)).isTrue

        val file2 = fixture.addFileToProject("test/components/foo.spec.js", "")
        assertThat(sut.isTestFile(file2.virtualFile, project)).isTrue

        val file3 = fixture.addFileToProject("tests/components/foo.test.jsx", "")
        assertThat(sut.isTestFile(file3.virtualFile, project)).isTrue

        val file4 = fixture.addFileToProject("foo.spec.jsx", "")
        assertThat(sut.isTestFile(file4.virtualFile, project)).isTrue

        val file5 = fixture.addFileToProject("foo.test.js", "")
        assertThat(sut.isTestFile(file5.virtualFile, project)).isTrue

        val file6 = fixture.addFileToProject("src/tst/services/fooService.test.js", "")
        assertThat(sut.isTestFile(file6.virtualFile, project)).isTrue

        val file7 = fixture.addFileToProject("tests/services/barService.spec.jsx", "")
        assertThat(sut.isTestFile(file7.virtualFile, project)).isTrue

        val file8 = fixture.addFileToProject("foo.Test.js", "")
        assertThat(sut.isTestFile(file8.virtualFile, project)).isTrue

        val file9 = fixture.addFileToProject("foo.Spec.js", "")
        assertThat(sut.isTestFile(file9.virtualFile, project)).isTrue
    }

    @Test
    fun `guessSourceFileName javascript`() {
        assertThat(sut.guessSourceFileName("fooBar.test.js")).isEqualTo("fooBar.js")
        assertThat(sut.guessSourceFileName("fooBar.spec.js")).isEqualTo("fooBar.js")
        assertThat(sut.guessSourceFileName("fooBarNoIdea.js")).isNull()
    }

    @Test
    fun `guessSourceFileName jsx`() {
        assertThat(sut.guessSourceFileName("fooBar.test.jsx")).isEqualTo("fooBar.jsx")
        assertThat(sut.guessSourceFileName("fooBar.spec.jsx")).isEqualTo("fooBar.jsx")
        assertThat(sut.guessSourceFileName("fooBarNoIdea.jsx")).isNull()
    }
}

class TsCodeWhispererFileCrawlerTest {
    @JvmField
    @Rule
    val projectRule: CodeInsightTestFixtureRule = CodeInsightTestFixtureRule()

    lateinit var fixture: CodeInsightTestFixture
    lateinit var project: Project

    lateinit var sut: CodeWhispererFileCrawler

    @Before
    fun setup() {
        sut = TypescriptCodeWhispererFileCrawler

        project = projectRule.project
        fixture = projectRule.fixture
    }

    @Test
    fun `isTest - should return false`() {
        val file1 = fixture.addFileToProject("src/utils/foo.ts", "")
        assertThat(sut.isTestFile(file1.virtualFile, project)).isFalse

        val file2 = fixture.addFileToProject("src/controler/bar.tsx", "")
        assertThat(sut.isTestFile(file2.virtualFile, project)).isFalse

        val file3 = fixture.addFileToProject("main.ts", "")
        assertThat(sut.isTestFile(file3.virtualFile, project)).isFalse

        val file4 = fixture.addFileToProject("component/dto/boo.tsx", "")
        assertThat(sut.isTestFile(file4.virtualFile, project)).isFalse
    }

    @Test
    fun `isTest - should return true`() {
        val file1 = fixture.addFileToProject("tst/components/foo.test.ts", "")
        assertThat(sut.isTestFile(file1.virtualFile, project)).isTrue

        val file2 = fixture.addFileToProject("test/components/foo.spec.ts", "")
        assertThat(sut.isTestFile(file2.virtualFile, project)).isTrue

        val file3 = fixture.addFileToProject("tests/components/foo.test.tsx", "")
        assertThat(sut.isTestFile(file3.virtualFile, project)).isTrue

        val file4 = fixture.addFileToProject("foo.spec.tsx", "")
        assertThat(sut.isTestFile(file4.virtualFile, project)).isTrue

        val file5 = fixture.addFileToProject("foo.test.ts", "")
        assertThat(sut.isTestFile(file5.virtualFile, project)).isTrue

        val file6 = fixture.addFileToProject("src/tst/services/fooService.test.ts", "")
        assertThat(sut.isTestFile(file6.virtualFile, project)).isTrue

        val file7 = fixture.addFileToProject("tests/services/barService.spec.tsx", "")
        assertThat(sut.isTestFile(file7.virtualFile, project)).isTrue

        val file8 = fixture.addFileToProject("foo.Test.ts", "")
        assertThat(sut.isTestFile(file8.virtualFile, project)).isTrue

        val file9 = fixture.addFileToProject("foo.Spec.ts", "")
        assertThat(sut.isTestFile(file9.virtualFile, project)).isTrue
    }

    @Test
    fun `guessSourceFileName typescript`() {
        assertThat(sut.guessSourceFileName("fooBar.test.ts")).isEqualTo("fooBar.ts")
        assertThat(sut.guessSourceFileName("fooBar.spec.ts")).isEqualTo("fooBar.ts")
        assertThat(sut.guessSourceFileName("fooBarNoIdea.ts")).isNull()
    }

    @Test
    fun `guessSourceFileName tsx`() {
        assertThat(sut.guessSourceFileName("fooBar.test.tsx")).isEqualTo("fooBar.tsx")
        assertThat(sut.guessSourceFileName("fooBar.spec.tsx")).isEqualTo("fooBar.tsx")
        assertThat(sut.guessSourceFileName("fooBarNoIdea.tsx")).isNull()
    }
}
