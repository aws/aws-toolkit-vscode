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
import software.aws.toolkits.jetbrains.utils.rules.CodeInsightTestFixtureRule
import software.aws.toolkits.jetbrains.utils.rules.JavaCodeInsightTestFixtureRule

open class CodeWhispererFileCrawlerTest(projectRule: CodeInsightTestFixtureRule) {
    @JvmField
    @Rule
    val projectRule: CodeInsightTestFixtureRule = projectRule

    lateinit var fixture: CodeInsightTestFixture
    lateinit var project: Project

    open fun setup() {
        fixture = projectRule.fixture
        project = projectRule.project
    }
}

class JavaCodeWhispererFileCrawlerTest : CodeWhispererFileCrawlerTest(JavaCodeInsightTestFixtureRule()) {
    lateinit var sut: CodeWhispererFileCrawler

    @Before
    override fun setup() {
        super.setup()
        sut = JavaCodeWhispererFileCrawler
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
    fun listRelevantFilesInEditor() {
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

        val actual = sut.listRelevantFilesInEditors(fileContextProviderFile)
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
    fun `findFilesUnderProjectRoot`() {
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

        val notImportedClass = fixture.addFileToProject(
            "/utils/NotImported.java",
            """
                package com.cw.file_crawler_test.utils;
                
                public class NotImported {}
            """.trimIndent()
        )

        val notImportedClass2 = fixture.addFileToProject(
            "/utils/NotImported2.java",
            """
                package com.cw.file_crawler_test.utils;
                
                public class NotImported2 {}
            """.trimIndent()
        )

        fun assertCrawlerFindCorrectFiles(sut: CodeWhispererFileCrawler) {
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

        assertCrawlerFindCorrectFiles(JavaCodeWhispererFileCrawler)
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
    fun `findFocalFileForTest by name`() {
        val mainPsi = fixture.addFileToProject("Main.java", aString())
        fixture.addFileToProject("Class1.java", aString())
        fixture.addFileToProject("Class2.java", aString())
        fixture.addFileToProject("Class3.java", aString())
        val tstPsi = fixture.addFileToProject("/tst/java/MainTest.java", aString())

        fun assertCrawlerFindCorrectFiles(sut: FileCrawler) {
            runInEdtAndWait {
                fixture.openFileInEditor(tstPsi.virtualFile)

                val actual = sut.findFocalFileForTest(tstPsi)

                assertThat(actual).isNotNull.isEqualTo(mainPsi.virtualFile)
            }
        }

        assertCrawlerFindCorrectFiles(JavaCodeWhispererFileCrawler)
    }

    @Test
    fun `findFocalFileForTest by content`() {
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
            "/tst/java/NotMatchingFileNameTest.java",
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

        fun assertCrawlerFindCorrectFiles(sut: FileCrawler) {
            runInEdtAndWait {
                val openedFiles = EditorFactory.getInstance().allEditors.size

                val actual = sut.findFocalFileForTest(tstPsi)

                assertThat(openedFiles).isEqualTo(5)
                assertThat(actual).isNotNull.isEqualTo(mainPsi.virtualFile)
            }
        }

        assertCrawlerFindCorrectFiles(JavaCodeWhispererFileCrawler)
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
}
