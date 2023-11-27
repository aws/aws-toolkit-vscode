// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.codemodernizer

import com.intellij.openapi.projectRoots.JavaSdkVersion
import com.intellij.openapi.roots.ModuleRootManager
import com.intellij.testFramework.runInEdtAndWait
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Before
import org.junit.Test
import org.mockito.Mockito.doReturn
import org.mockito.Mockito.mock
import org.mockito.Mockito.`when`
import org.mockito.kotlin.any
import org.mockito.kotlin.atLeastOnce
import org.mockito.kotlin.doNothing
import org.mockito.kotlin.times
import org.mockito.kotlin.verify
import org.mockito.kotlin.verifyNoMoreInteractions
import org.mockito.kotlin.whenever
import software.amazon.awssdk.services.codewhispererruntime.model.TransformationStatus
import software.aws.toolkits.jetbrains.services.codemodernizer.model.CodeModernizerJobCompletedResult
import software.aws.toolkits.jetbrains.services.codemodernizer.model.CodeModernizerSessionContext
import software.aws.toolkits.jetbrains.services.codemodernizer.model.CodeModernizerStartJobResult
import software.aws.toolkits.jetbrains.services.codemodernizer.model.ZipCreationResult
import software.aws.toolkits.jetbrains.utils.rules.HeavyJavaCodeInsightTestFixtureRule
import software.aws.toolkits.jetbrains.utils.rules.addFileToModule
import java.io.File
import java.util.zip.ZipFile
import kotlin.io.path.Path
import kotlin.test.assertNotNull

class CodeWhispererCodeModernizerSessionTest : CodeWhispererCodeModernizerTestBase(HeavyJavaCodeInsightTestFixtureRule()) {
    fun addFilesToProjectModule(vararg path: String) {
        val module = projectRule.module
        path.forEach { projectRule.fixture.addFileToModule(module, it, it) }
    }

    @Before
    override fun setup() {
        super.setup()
    }

    @Test
    fun `CodeModernizerSession can create zip with module files`() {
        val module = projectRule.module
        val fileText = "Morning"
        projectRule.fixture.addFileToModule(module, "src/tmp.txt", fileText)

        var file: File? = null
        // get project.projectFile because project.projectFile can not be null
        val rootManager = ModuleRootManager.getInstance(module)
        val roots = rootManager.contentRoots
        assertFalse(roots.isEmpty() || roots.size > 1)
        assert(rootManager.dependencies.isEmpty())
        val root = roots[0]
        val context = CodeModernizerSessionContext(project, root.children[0], JavaSdkVersion.JDK_1_8, JavaSdkVersion.JDK_11)
        val codeContext = mock(CodeModernizerSessionContext::class.java)
        val mockFile = mock(File::class.java)
        `when`(codeContext.runMavenCommand(mockFile)).thenReturn(mock(File::class.java))
        runInEdtAndWait {
            file = context.createZipWithModuleFiles().payload
        }
        assertNotNull(file)
        val zipFile = ZipFile(file)
        val entries = zipFile.entries()
        var numEntries = 0
        while (entries.hasMoreElements()) {
            numEntries += 1
            val entry = entries.nextElement() ?: continue
            val fileContent = zipFile.getInputStream(entry).bufferedReader().readLine()
            when (Path(entry.name)) {
                Path("manifest.json") -> assertNotNull(fileContent)
                Path("sources/src/tmp.txt") -> assertEquals(fileText, fileContent)
                else -> throw AssertionError("Unexpected entry in zip file: $entry")
            }
        }
        assert(numEntries == 2)
    }

    @Test
    fun `CodeModernizerSession can create zip with module files and excludes target dir if pom xml present`() {
        val module = projectRule.module
        val fileText = "Morning"
        projectRule.fixture.addFileToModule(module, "src/tmp.java", fileText)
        projectRule.fixture.addFileToModule(module, "target/smth.java", fileText)
        projectRule.fixture.addFileToModule(module, "target/somedir/anotherthing.class", fileText)
        projectRule.fixture.addFileToModule(module, "pom.xml", fileText)

        var file: File? = null
        // get project.projectFile because project.projectFile can not be null
        val rootManager = ModuleRootManager.getInstance(module)
        val roots = rootManager.contentRoots
        assertFalse(roots.isEmpty() || roots.size > 1)
        assert(rootManager.dependencies.isEmpty())
        val pom = roots[0].children.first { it.name == "pom.xml" }
        val context = CodeModernizerSessionContext(project, pom, JavaSdkVersion.JDK_1_8, JavaSdkVersion.JDK_11)
        val codeContext = mock(CodeModernizerSessionContext::class.java)
        val mockFile = mock(File::class.java)
        `when`(codeContext.runMavenCommand(mockFile)).thenReturn(mock(File::class.java))
        runInEdtAndWait {
            file = context.createZipWithModuleFiles().payload
        }
        assertNotNull(file)
        val zipFile = ZipFile(file)
        val entries = zipFile.entries()
        while (entries.hasMoreElements()) {
            val entry = entries.nextElement() ?: continue
            val fileContent = zipFile.getInputStream(entry).bufferedReader().readLine()
            when (Path(entry.name)) {
                Path("manifest.json") -> assertNotNull(fileContent)
                Path("sources/src/tmp.java") -> assertEquals(fileText, fileContent)
                Path("sources/pom.xml") -> assertEquals(fileText, fileContent)
                else -> throw AssertionError("Unexpected entry in zip file: $entry")
            }
        }
    }

    @Test
    fun `CodeModernizerSession can create zip with module files and dependency files excludes target dir if pom xml present`() {
        val module = projectRule.module
        val fileText = "Morning"
        projectRule.fixture.addFileToModule(module, "src/tmp.java", fileText)
        projectRule.fixture.addFileToModule(module, "target/smth.java", fileText)
        projectRule.fixture.addFileToModule(module, "target/somedir/anotherthing.class", fileText)
        projectRule.fixture.addFileToModule(module, "pom.xml", fileText)

        var file: File? = null
        // get project.projectFile because project.projectFile can not be null
        val rootManager = ModuleRootManager.getInstance(module)
        val roots = rootManager.contentRoots
        assertFalse(roots.isEmpty() || roots.size > 1)

        val pom = roots[0].children.first { it.name == "pom.xml" }
        val context = CodeModernizerSessionContext(project, pom, JavaSdkVersion.JDK_1_8, JavaSdkVersion.JDK_11)
        runInEdtAndWait {
            file = context.createZipWithModuleFiles().payload
        }
        assertNotNull(file)
        val zipFile = ZipFile(file)
        val entries = zipFile.entries()
        while (entries.hasMoreElements()) {
            val entry = entries.nextElement() ?: continue
            val fileContent = zipFile.getInputStream(entry).bufferedReader().readLine()
            when (Path(entry.name)) {
                Path("manifest.json") -> assertNotNull(fileContent)
                Path("sources/src/tmp.java") -> assertEquals(fileText, fileContent)
                Path("sources/pom.xml") -> assertEquals(fileText, fileContent)
                else -> throw AssertionError("Unexpected entry in zip file: $entry")
            }
        }
    }

    @Test
    fun `CodeModernizerSession can create zip and exludes nested target`() {
        addFilesToProjectModule(
            "src/tmp.java",
            "target/smth.java",
            "target/somedir/anotherthing.class",
            "pom.xml",
            "someModule/pom.xml",
            "someModule/target/smth.class",
            "someModule/src/helloworld.java",
        )
        var file: File? = null
        val rootManager = ModuleRootManager.getInstance(module)
        val roots = rootManager.contentRoots
        assertFalse(roots.isEmpty() || roots.size > 1)

        val pom = roots[0].children.first { it.name == "pom.xml" }
        val context = CodeModernizerSessionContext(project, pom, JavaSdkVersion.JDK_1_8, JavaSdkVersion.JDK_11)
        runInEdtAndWait {
            file = context.createZipWithModuleFiles().payload
        }
        assertNotNull(file)
        val zipFile = ZipFile(file)
        val entries = zipFile.entries()
        while (entries.hasMoreElements()) {
            val entry = entries.nextElement() ?: continue
            val fileContent = zipFile.getInputStream(entry).bufferedReader().readLine()
            when (Path(entry.name)) {
                Path("manifest.json") -> assertNotNull(fileContent)
                Path("sources/src/tmp.java") -> assertEquals("src/tmp.java", fileContent)
                Path("sources/pom.xml") -> assertEquals("pom.xml", fileContent)
                Path("sources/someModule/src/helloworld.java") -> assertEquals("someModule/src/helloworld.java", fileContent)
                Path("sources/someModule/pom.xml") -> assertEquals("someModule/pom.xml", fileContent)
                else -> throw AssertionError("Unexpected entry in zip file: $entry")
            }
        }
    }

    @Test
    fun `CodeModernizerSession can create zip and excludes idea folder`() {
        addFilesToProjectModule(
            "pom.xml",
            "src/tmp.java",
            ".idea/smth.iml",
            "someModule/pom.xml",
            "someModule/.idea/smthelse.iml"
        )
        var file: File? = null
        // get project.projectFile because project.projectFile can not be null
        val rootManager = ModuleRootManager.getInstance(module)
        val roots = rootManager.contentRoots
        assertFalse(roots.isEmpty() || roots.size > 1)

        val pom = roots[0].children.first { it.name == "pom.xml" }
        val context = CodeModernizerSessionContext(project, pom, JavaSdkVersion.JDK_1_8, JavaSdkVersion.JDK_11)
        runInEdtAndWait {
            file = context.createZipWithModuleFiles().payload
        }
        assertNotNull(file)
        val zipFile = ZipFile(file)
        val entries = zipFile.entries()
        while (entries.hasMoreElements()) {
            val entry = entries.nextElement() ?: continue
            val fileContent = zipFile.getInputStream(entry).bufferedReader().readLine()
            when (Path(entry.name)) {
                Path("manifest.json") -> assertNotNull(fileContent)
                Path("sources/pom.xml") -> assertEquals("pom.xml", fileContent)
                Path("sources/src/tmp.java") -> assertEquals("src/tmp.java", fileContent)
                Path("sources/someModule/pom.xml") -> assertEquals("someModule/pom.xml", fileContent)
                else -> throw AssertionError("Unexpected entry in zip file: $entry")
            }
        }
    }

    @Test
    fun `CodeModernizer can create modernization job`() {
        doReturn(ZipCreationResult.Succeeded(File("./tst-resources/codemodernizer/test.txt")))
            .whenever(testSessionContextSpy).createZipWithModuleFiles()
        doReturn(exampleCreateUploadUrlResponse).whenever(clientAdaptorSpy).createGumbyUploadUrl(any())
        doNothing().whenever(testSessionSpy).uploadArtifactToS3(any(), any(), any(), any())
        doReturn(exampleStartCodeMigrationResponse).whenever(clientAdaptorSpy).startCodeModernization(any(), any(), any())
        val result = testSessionSpy.createModernizationJob()
        assertEquals(result, CodeModernizerStartJobResult.Started(jobId))
        verify(clientAdaptorSpy, times(1)).createGumbyUploadUrl(any())
        verify(clientAdaptorSpy, times(1)).startCodeModernization(any(), any(), any())
        verifyNoMoreInteractions(clientAdaptorSpy)
    }

    @Test
    fun `CodeModernizer can poll job for status updates`() {
        doReturn(exampleGetCodeMigrationResponse, *happyPathMigrationResponses.toTypedArray()).whenever(clientAdaptorSpy).getCodeModernizationJob(any())
        doReturn(exampleGetCodeMigrationPlanResponse).whenever(clientAdaptorSpy).getCodeModernizationPlan(any())
        doReturn(exampleStartCodeMigrationResponse).whenever(clientAdaptorSpy).startCodeModernization(any(), any(), any())

        doNothing().whenever(testSessionStateSpy).updateJobHistory(any(), any(), any())
        val result = runBlocking {
            testSessionSpy.pollUntilJobCompletion(jobId) { _, _ -> }
        }
        assertEquals(CodeModernizerJobCompletedResult.JobCompletedSuccessfully(jobId), result)

        // two polls to check status as we 1. check for plan existing and 2. check if job completed
        // since the transformationStatus is dynamic by the happyPathMigrationResponses so there will be 10 times to call getCodeModernizationJob
        verify(clientAdaptorSpy, atLeastOnce()).getCodeModernizationJob(any())
        verify(clientAdaptorSpy, atLeastOnce()).getCodeModernizationPlan(any())
    }

    @Test
    fun `CodeModernizer detects partially migrated code`() {
        doReturn(
            exampleGetCodeMigrationResponse.replace(TransformationStatus.STARTED),
            exampleGetCodeMigrationResponse.replace(TransformationStatus.PLANNED),
            exampleGetCodeMigrationResponse.replace(TransformationStatus.TRANSFORMING),
            exampleGetCodeMigrationResponse.replace(TransformationStatus.PARTIALLY_COMPLETED),
        ).whenever(clientAdaptorSpy).getCodeModernizationJob(any())
        doReturn(exampleGetCodeMigrationPlanResponse).whenever(clientAdaptorSpy).getCodeModernizationPlan(any())
        doReturn(exampleStartCodeMigrationResponse).whenever(clientAdaptorSpy).startCodeModernization(any(), any(), any())

        doNothing().whenever(testSessionStateSpy).updateJobHistory(any(), any(), any())
        val result = runBlocking {
            testSessionSpy.pollUntilJobCompletion(jobId) { _, _ -> }
        }
        assertEquals(CodeModernizerJobCompletedResult.JobPartiallySucceeded(jobId, testSessionContextSpy.targetJavaVersion), result)
        verify(clientAdaptorSpy, times(4)).getCodeModernizationJob(any())
        verify(clientAdaptorSpy, atLeastOnce()).getCodeModernizationPlan(any())
    }
}
