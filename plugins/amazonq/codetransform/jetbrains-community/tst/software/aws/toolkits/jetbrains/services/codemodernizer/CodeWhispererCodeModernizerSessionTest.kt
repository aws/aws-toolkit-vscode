// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codemodernizer

import com.github.tomakehurst.wiremock.client.WireMock.aResponse
import com.github.tomakehurst.wiremock.client.WireMock.put
import com.github.tomakehurst.wiremock.client.WireMock.urlEqualTo
import com.github.tomakehurst.wiremock.core.WireMockConfiguration
import com.github.tomakehurst.wiremock.junit.WireMockRule
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.projectRoots.JavaSdkVersion
import com.intellij.openapi.roots.ModuleRootManager
import com.intellij.serviceContainer.AlreadyDisposedException
import com.intellij.testFramework.common.ThreadLeakTracker
import com.intellij.testFramework.runInEdtAndGet
import com.intellij.testFramework.runInEdtAndWait
import com.intellij.testFramework.utils.io.createFile
import com.intellij.util.io.HttpRequests
import com.intellij.util.io.delete
import kotlinx.coroutines.runBlocking
import org.apache.commons.codec.digest.DigestUtils
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.fail
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import org.mockito.Mockito.doReturn
import org.mockito.Mockito.mock
import org.mockito.Mockito.spy
import org.mockito.kotlin.any
import org.mockito.kotlin.atLeastOnce
import org.mockito.kotlin.doAnswer
import org.mockito.kotlin.doNothing
import org.mockito.kotlin.eq
import org.mockito.kotlin.inOrder
import org.mockito.kotlin.stub
import org.mockito.kotlin.times
import org.mockito.kotlin.verify
import org.mockito.kotlin.verifyNoMoreInteractions
import org.mockito.kotlin.whenever
import software.amazon.awssdk.awscore.DefaultAwsResponseMetadata
import software.amazon.awssdk.awscore.util.AwsHeader
import software.amazon.awssdk.http.SdkHttpResponse
import software.amazon.awssdk.services.codewhispererruntime.model.CreateUploadUrlResponse
import software.amazon.awssdk.services.codewhispererruntime.model.TransformationStatus
import software.aws.toolkits.core.utils.exists
import software.aws.toolkits.jetbrains.services.codemodernizer.model.CodeModernizerJobCompletedResult
import software.aws.toolkits.jetbrains.services.codemodernizer.model.CodeModernizerSessionContext
import software.aws.toolkits.jetbrains.services.codemodernizer.model.CodeModernizerStartJobResult
import software.aws.toolkits.jetbrains.services.codemodernizer.model.CodeTransformHilDownloadArtifact
import software.aws.toolkits.jetbrains.services.codemodernizer.model.MavenCopyCommandsResult
import software.aws.toolkits.jetbrains.services.codemodernizer.model.UploadFailureReason
import software.aws.toolkits.jetbrains.services.codemodernizer.model.ZipCreationResult
import software.aws.toolkits.jetbrains.services.codewhisperer.service.CodeWhispererService
import software.aws.toolkits.jetbrains.utils.rules.HeavyJavaCodeInsightTestFixtureRule
import software.aws.toolkits.jetbrains.utils.rules.addFileToModule
import java.io.File
import java.io.FileInputStream
import java.io.IOException
import java.net.ConnectException
import java.util.Base64
import java.util.zip.ZipFile
import kotlin.io.path.Path
import kotlin.io.path.createTempDirectory

class CodeWhispererCodeModernizerSessionTest : CodeWhispererCodeModernizerTestBase(HeavyJavaCodeInsightTestFixtureRule()) {
    private fun addFilesToProjectModule(vararg path: String) {
        val module = projectRule.module
        path.forEach { projectRule.fixture.addFileToModule(module, it, it) }
    }

    @Rule
    @JvmField
    val wireMock = WireMockRule(WireMockConfiguration.wireMockConfig().dynamicPort())

    @Rule
    @JvmField
    val tempFolder = TemporaryFolder()

    @Before
    override fun setup() {
        super.setup()
        ThreadLeakTracker.longRunningThreadCreated(ApplicationManager.getApplication(), "Process Proxy: Launcher")
    }

    @Test
    fun `CodeModernizerSessionContext shows the transformation hub once ide maven finishes successfully`() {
        val module = projectRule.module
        val fileText = "Morning"
        projectRule.fixture.addFileToModule(module, "src/tmp.txt", fileText)

        // get project.projectFile because project.projectFile can not be null
        val roots = ModuleRootManager.getInstance(module).contentRoots
        val root = roots[0]
        val context = spy(CodeModernizerSessionContext(project, root.children[0], JavaSdkVersion.JDK_1_8, JavaSdkVersion.JDK_11))
        val result = spy(MavenCopyCommandsResult.Success(File("")))
        doReturn(null).`when`(result).dependencyDirectory
        doReturn(result).`when`(context).executeMavenCopyCommands(any(), any())
        runInEdtAndWait {
            context.createZipWithModuleFiles(result).payload
            verify(context, times(1)).showTransformationHub()
            verify(result, atLeastOnce()).dependencyDirectory
        }
    }

    @Test
    fun `CodeModernizerSessionContext does not show the transformation hub once ide maven fails`() {
        val module = projectRule.module
        val fileText = "Morning"
        projectRule.fixture.addFileToModule(module, "src/tmp.txt", fileText)

        // get project.projectFile because project.projectFile can not be null
        val roots = ModuleRootManager.getInstance(module).contentRoots
        val root = roots[0]
        val context = spy(CodeModernizerSessionContext(project, root.children[0], JavaSdkVersion.JDK_1_8, JavaSdkVersion.JDK_11))
        val result = MavenCopyCommandsResult.Failure
        doReturn(result).`when`(context).executeMavenCopyCommands(any(), any())
        runInEdtAndWait {
            context.createZipWithModuleFiles(result).payload
            verify(context, times(0)).showTransformationHub()
        }
    }

    @Test
    fun `CodeModernizerSession can create zip with module files`() {
        val module = projectRule.module
        val fileText = "Morning"
        projectRule.fixture.addFileToModule(module, "src/tmp.txt", fileText)

        // get project.projectFile because project.projectFile can not be null
        val rootManager = ModuleRootManager.getInstance(module)
        val roots = rootManager.contentRoots
        assertFalse(roots.isEmpty() || roots.size > 1)
        assert(rootManager.dependencies.isEmpty())
        val root = roots[0]
        val context = CodeModernizerSessionContext(project, root.children[0], JavaSdkVersion.JDK_1_8, JavaSdkVersion.JDK_11)
        val mockFile = mock(File::class.java)
        val mockStringBuilder = mock(StringBuilder::class.java)
        val file = runInEdtAndGet {
            val result = context.executeMavenCopyCommands(mockFile, mockStringBuilder)
            context.createZipWithModuleFiles(result).payload
        }
        ZipFile(file).use { zipFile ->
            var numEntries = 0
            assertThat(zipFile.entries().toList()).allSatisfy { entry ->
                numEntries += 1
                val fileContent = zipFile.getInputStream(entry).bufferedReader().readLine()
                when (Path(entry.name)) {
                    Path("manifest.json") -> assertNotNull(fileContent)
                    Path("sources/src/tmp.txt") -> assertEquals(fileText, fileContent)
                    Path("build-logs.txt") -> assertNotNull(fileContent)
                    else -> fail("Unexpected entry in zip file: $entry")
                }
            }
            zipFile.close()
            assert(numEntries == 3)
        }
    }

    @Test
    fun `CodeModernizerSession can create zip with module files and excludes target dir if pom xml present`() {
        val module = projectRule.module
        val fileText = "Morning"
        projectRule.fixture.addFileToModule(module, "src/tmp.java", fileText)
        projectRule.fixture.addFileToModule(module, "target/smth.java", fileText)
        projectRule.fixture.addFileToModule(module, "target/somedir/anotherthing.class", fileText)
        projectRule.fixture.addFileToModule(module, "pom.xml", fileText)

        // get project.projectFile because project.projectFile can not be null
        val rootManager = ModuleRootManager.getInstance(module)
        val roots = rootManager.contentRoots
        assertFalse(roots.isEmpty() || roots.size > 1)
        assert(rootManager.dependencies.isEmpty())
        val pom = roots[0].children.first { it.name == "pom.xml" }
        val context = CodeModernizerSessionContext(project, pom, JavaSdkVersion.JDK_1_8, JavaSdkVersion.JDK_11)
        val mockFile = mock(File::class.java)
        val mockStringBuilder = mock(StringBuilder::class.java)
        val file = runInEdtAndGet {
            val result = context.executeMavenCopyCommands(mockFile, mockStringBuilder)
            context.createZipWithModuleFiles(result).payload
        }
        ZipFile(file).use { zipFile ->
            assertThat(zipFile.entries().toList()).allSatisfy { entry ->
                val fileContent = zipFile.getInputStream(entry).bufferedReader().readLine()
                when (Path(entry.name)) {
                    Path("manifest.json") -> assertNotNull(fileContent)
                    Path("sources/src/tmp.java") -> assertEquals(fileText, fileContent)
                    Path("sources/pom.xml") -> assertEquals(fileText, fileContent)
                    Path("build-logs.txt") -> assertNotNull(fileContent)
                    else -> fail("Unexpected entry in zip file: $entry")
                }
            }
            zipFile.close()
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

        // get project.projectFile because project.projectFile can not be null
        val rootManager = ModuleRootManager.getInstance(module)
        val roots = rootManager.contentRoots
        assertFalse(roots.isEmpty() || roots.size > 1)

        val pom = roots[0].children.first { it.name == "pom.xml" }
        val context = CodeModernizerSessionContext(project, pom, JavaSdkVersion.JDK_1_8, JavaSdkVersion.JDK_11)
        val mockFile = mock(File::class.java)
        val mockStringBuilder = mock(StringBuilder::class.java)
        val file = runInEdtAndGet {
            val result = context.executeMavenCopyCommands(mockFile, mockStringBuilder)
            context.createZipWithModuleFiles(result).payload
        }
        ZipFile(file).use { zipFile ->
            assertThat(zipFile.entries().toList()).allSatisfy { entry ->
                val fileContent = zipFile.getInputStream(entry).bufferedReader().readLine()
                when (Path(entry.name)) {
                    Path("manifest.json") -> assertNotNull(fileContent)
                    Path("sources/src/tmp.java") -> assertEquals(fileText, fileContent)
                    Path("sources/pom.xml") -> assertEquals(fileText, fileContent)
                    Path("build-logs.txt") -> assertNotNull(fileContent)
                    else -> fail("Unexpected entry in zip file: $entry")
                }
            }
            zipFile.close()
        }
    }

    @Test
    fun `CodeModernizerSession can create zip and exclude nested target`() {
        addFilesToProjectModule(
            "src/tmp.java",
            "target/smth.java",
            "target/somedir/anotherthing.class",
            "pom.xml",
            "someModule/pom.xml",
            "someModule/target/smth.class",
            "someModule/src/helloworld.java",
        )
        val rootManager = ModuleRootManager.getInstance(module)
        val roots = rootManager.contentRoots
        assertFalse(roots.isEmpty() || roots.size > 1)

        val pom = roots[0].children.first { it.name == "pom.xml" }
        val context = CodeModernizerSessionContext(project, pom, JavaSdkVersion.JDK_1_8, JavaSdkVersion.JDK_11)
        val mockFile = mock(File::class.java)
        val mockStringBuilder = mock(StringBuilder::class.java)
        val file = runInEdtAndGet {
            val result = context.executeMavenCopyCommands(mockFile, mockStringBuilder)
            context.createZipWithModuleFiles(result).payload
        }
        ZipFile(file).use { zipFile ->
            assertThat(zipFile.entries().toList()).allSatisfy { entry ->
                val fileContent = zipFile.getInputStream(entry).bufferedReader().readLine()
                when (Path(entry.name)) {
                    Path("manifest.json") -> assertNotNull(fileContent)
                    Path("sources/src/tmp.java") -> assertEquals("src/tmp.java", fileContent)
                    Path("sources/pom.xml") -> assertEquals("pom.xml", fileContent)
                    Path("sources/someModule/src/helloworld.java") -> assertEquals("someModule/src/helloworld.java", fileContent)
                    Path("sources/someModule/pom.xml") -> assertEquals("someModule/pom.xml", fileContent)
                    Path("build-logs.txt") -> assertNotNull(fileContent)
                    else -> fail("Unexpected entry in zip file: $entry")
                }
            }
            zipFile.close()
        }
    }

    @Test
    fun `CodeModernizerSession can create zip and replace Windows file path`() {
        addFilesToProjectModule(
            "src\\tmp.java",
            "target\\smth.java",
            "target\\somedir\\anotherthing.class",
            "pom.xml",
            "someModule\\pom.xml",
            "someModule\\target\\smth.class",
            "someModule\\src\\helloworld.java",
        )
        val rootManager = ModuleRootManager.getInstance(module)
        val roots = rootManager.contentRoots
        assertFalse(roots.isEmpty() || roots.size > 1)

        val pom = roots[0].children.first { it.name == "pom.xml" }
        val context = CodeModernizerSessionContext(project, pom, JavaSdkVersion.JDK_1_8, JavaSdkVersion.JDK_11)
        val mockFile = mock(File::class.java)
        val mockStringBuilder = mock(StringBuilder::class.java)
        val file = runInEdtAndGet {
            val result = context.executeMavenCopyCommands(mockFile, mockStringBuilder)
            context.createZipWithModuleFiles(result).payload
        }
        ZipFile(file).use { zipFile ->
            assertThat(zipFile.entries().toList()).allSatisfy { entry ->
                val fileContent = zipFile.getInputStream(entry).bufferedReader().readLine()
                when (Path(entry.name)) {
                    Path("manifest.json") -> assertNotNull(fileContent)
                    Path("sources/src/tmp.java") -> assertEquals("src\\tmp.java", fileContent)
                    Path("sources/pom.xml") -> assertEquals("pom.xml", fileContent)
                    Path("sources/someModule/src/helloworld.java") -> assertEquals("someModule\\src\\helloworld.java", fileContent)
                    Path("sources/someModule/pom.xml") -> assertEquals("someModule\\pom.xml", fileContent)
                    Path("build-logs.txt") -> assertNotNull(fileContent)
                    else -> fail("Unexpected entry in zip file: $entry")
                }
            }
            zipFile.close()
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
        // get project.projectFile because project.projectFile can not be null
        val rootManager = ModuleRootManager.getInstance(module)
        val roots = rootManager.contentRoots
        assertFalse(roots.isEmpty() || roots.size > 1)

        val pom = roots[0].children.first { it.name == "pom.xml" }
        val context = CodeModernizerSessionContext(project, pom, JavaSdkVersion.JDK_1_8, JavaSdkVersion.JDK_11)
        val mockFile = mock(File::class.java)
        val mockStringBuilder = mock(StringBuilder::class.java)
        val file = runInEdtAndGet {
            val result = context.executeMavenCopyCommands(mockFile, mockStringBuilder)
            context.createZipWithModuleFiles(result).payload
        }
        ZipFile(file).use { zipFile ->
            assertThat(zipFile.entries().toList()).allSatisfy { entry ->
                val fileContent = zipFile.getInputStream(entry).bufferedReader().readLine()
                when (Path(entry.name)) {
                    Path("manifest.json") -> assertNotNull(fileContent)
                    Path("sources/pom.xml") -> assertEquals("pom.xml", fileContent)
                    Path("sources/src/tmp.java") -> assertEquals("src/tmp.java", fileContent)
                    Path("sources/someModule/pom.xml") -> assertEquals("someModule/pom.xml", fileContent)
                    Path("build-logs.txt") -> assertNotNull(fileContent)
                    else -> throw AssertionError("Unexpected entry in zip file: $entry")
                }
            }
            zipFile.close()
        }
    }

    @Test
    fun `CodeModernizerSession can create zip and excludes maven metadata from dependencies folder`() {
        // get project.projectFile because project.projectFile can not be null
        val context = CodeModernizerSessionContext(project, emptyPomFile, JavaSdkVersion.JDK_1_8, JavaSdkVersion.JDK_11)
        val m2Folders = listOf(
            "com/groupid1/artifactid1/version1",
            "com/groupid1/artifactid1/version2",
            "com/groupid1/artifactid2/version1",
            "com/groupid2/artifactid1/version1",
            "com/groupid2/artifactid1/version2",
        )
        // List of files that exist in m2 artifact directory
        val filesToAdd = listOf(
            "_remote.repositories",
            "test-0.0.1-20240315.145420-18.pom",
            "test-0.0.1-20240315.145420-18.pom.sha1",
            "test-0.0.1-SNAPSHOT.pom",
            "maven-metadata-test-repo.xml",
            "maven-metadata-test-repo.xml.sha1",
            "resolver-status.properties",
        )
        val expectedFilesAfterClean = listOf(
            "test-0.0.1-20240315.145420-18.pom",
            "test-0.0.1-SNAPSHOT.pom",
            "maven-metadata-test-repo.xml",
            "resolver-status.properties",
        )

        m2Folders.forEach {
            val newFolder = tempFolder.newFolder(*it.split("/").toTypedArray())
            filesToAdd.forEach { file -> newFolder.toPath().resolve(file).createFile() }
        }

        val dependenciesToUpload = context.iterateThroughDependencies(tempFolder.root)
        assertEquals(m2Folders.size * expectedFilesAfterClean.size, dependenciesToUpload.size)
        assertTrue(dependenciesToUpload.all { it.name in expectedFilesAfterClean })
    }

    @Test
    fun `CodeModernizer can create modernization job`() {
        doReturn(ZipCreationResult.Succeeded(File("./tst-resources/codemodernizer/test.txt")))
            .whenever(testSessionContextSpy).createZipWithModuleFiles(any())
        doReturn(exampleCreateUploadUrlResponse).whenever(clientAdaptorSpy).createGumbyUploadUrl(any())
        doNothing().whenever(clientAdaptorSpy).uploadArtifactToS3(any(), any(), any(), any(), any())
        doReturn(exampleStartCodeMigrationResponse).whenever(clientAdaptorSpy).startCodeModernization(any(), any(), any())
        val result = testSessionSpy.createModernizationJob(MavenCopyCommandsResult.Success(File("./mock/path/")))
        assertEquals(result, CodeModernizerStartJobResult.Started(jobId))
        verify(clientAdaptorSpy, times(1)).createGumbyUploadUrl(any())
        verify(clientAdaptorSpy, times(1)).startCodeModernization(any(), any(), any())
        verify(clientAdaptorSpy, times(1)).uploadArtifactToS3(any(), any(), any(), any(), any())
        verifyNoMoreInteractions(clientAdaptorSpy)
    }

    @Test
    fun `CodeModernizer cannot upload payload due to already disposed`() {
        doReturn(ZipCreationResult.Succeeded(File("./tst-resources/codemodernizer/test.txt")))
            .whenever(testSessionContextSpy).createZipWithModuleFiles(any())
        doReturn(exampleCreateUploadUrlResponse).whenever(clientAdaptorSpy).createGumbyUploadUrl(any())
        doAnswer { throw AlreadyDisposedException("mock exception") }.whenever(clientAdaptorSpy).uploadArtifactToS3(any(), any(), any(), any(), any())
        val result = testSessionSpy.createModernizationJob(MavenCopyCommandsResult.Success(File("./mock/path/")))
        assertEquals(CodeModernizerStartJobResult.Disposed, result)
    }

    @Test
    fun `CodeModernizer cannot upload payload due to presigned url issue`() {
        doReturn(ZipCreationResult.Succeeded(File("./tst-resources/codemodernizer/test.txt")))
            .whenever(testSessionContextSpy).createZipWithModuleFiles(any())
        doReturn(exampleCreateUploadUrlResponse).whenever(clientAdaptorSpy).createGumbyUploadUrl(any())
        doAnswer { throw HttpRequests.HttpStatusException("mock error", 403, "mock url") }
            .whenever(clientAdaptorSpy).uploadArtifactToS3(any(), any(), any(), any(), any())
        val result = testSessionSpy.createModernizationJob(MavenCopyCommandsResult.Success(File("./mock/path/")))
        assertEquals(CodeModernizerStartJobResult.ZipUploadFailed(UploadFailureReason.PRESIGNED_URL_EXPIRED), result)
        verify(testSessionStateSpy, times(1)).putJobHistory(any(), eq(TransformationStatus.FAILED), any(), any())
        assertEquals(testSessionStateSpy.currentJobStatus, TransformationStatus.FAILED)
    }

    @Test
    fun `CodeModernizer cannot upload payload due to other status code`() {
        doReturn(ZipCreationResult.Succeeded(File("./tst-resources/codemodernizer/test.txt")))
            .whenever(testSessionContextSpy).createZipWithModuleFiles(any())
        doReturn(exampleCreateUploadUrlResponse).whenever(clientAdaptorSpy).createGumbyUploadUrl(any())
        doAnswer { throw HttpRequests.HttpStatusException("mock error", 407, "mock url") }
            .whenever(clientAdaptorSpy).uploadArtifactToS3(any(), any(), any(), any(), any())
        val result = testSessionSpy.createModernizationJob(MavenCopyCommandsResult.Success(File("./mock/path/")))
        assertEquals(CodeModernizerStartJobResult.ZipUploadFailed(UploadFailureReason.HTTP_ERROR(407)), result)
        verify(testSessionStateSpy, times(1)).putJobHistory(any(), eq(TransformationStatus.FAILED), any(), any())
        assertEquals(testSessionStateSpy.currentJobStatus, TransformationStatus.FAILED)
    }

    @Test
    fun `CodeModernizer cannot upload payload due to unknown issue`() {
        doReturn(ZipCreationResult.Succeeded(File("./tst-resources/codemodernizer/test.txt")))
            .whenever(testSessionContextSpy).createZipWithModuleFiles(any())
        doReturn(exampleCreateUploadUrlResponse).whenever(clientAdaptorSpy).createGumbyUploadUrl(any())
        doAnswer { throw IOException("mock exception") }.whenever(clientAdaptorSpy).uploadArtifactToS3(any(), any(), any(), any(), any())
        val result = testSessionSpy.createModernizationJob(MavenCopyCommandsResult.Success(File("./mock/path/")))
        assertEquals(CodeModernizerStartJobResult.ZipUploadFailed(UploadFailureReason.OTHER("mock exception")), result)
        verify(testSessionStateSpy, times(1)).putJobHistory(any(), eq(TransformationStatus.FAILED), any(), any())
        assertEquals(testSessionStateSpy.currentJobStatus, TransformationStatus.FAILED)
    }

    @Test
    fun `CodeModernizer cannot upload payload due to connection refused`() {
        doReturn(ZipCreationResult.Succeeded(File("./tst-resources/codemodernizer/test.txt")))
            .whenever(testSessionContextSpy).createZipWithModuleFiles(any())
        doReturn(exampleCreateUploadUrlResponse).whenever(clientAdaptorSpy).createGumbyUploadUrl(any())
        doAnswer { throw ConnectException("mock exception") }.whenever(clientAdaptorSpy).uploadArtifactToS3(any(), any(), any(), any(), any())
        val result = testSessionSpy.createModernizationJob(MavenCopyCommandsResult.Success(File("./mock/path/")))
        assertEquals(CodeModernizerStartJobResult.ZipUploadFailed(UploadFailureReason.CONNECTION_REFUSED), result)
        verify(testSessionStateSpy, times(1)).putJobHistory(any(), eq(TransformationStatus.FAILED), any(), any())
        assertEquals(testSessionStateSpy.currentJobStatus, TransformationStatus.FAILED)
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

    @Test
    fun `overwritten files would have different checksum from expected files`() {
        val expectedSha256checksum: String = Base64.getEncoder().encodeToString(
            DigestUtils.sha256(FileInputStream(expectedFilePath.toAbsolutePath().toString()))
        )
        val fakeSha256checksum: String = Base64.getEncoder().encodeToString(
            DigestUtils.sha256(FileInputStream(overwrittenFilePath.toAbsolutePath().toString()))
        )
        assertThat(expectedSha256checksum).isNotEqualTo(fakeSha256checksum)
    }

    @Test
    fun `test uploadPayload()`() {
        val s3endpoint = "http://127.0.0.1:${wireMock.port()}"
        val gumbyUploadUrlResponse = CreateUploadUrlResponse.builder()
            .uploadUrl(s3endpoint)
            .uploadId("1234")
            .kmsKeyArn("0000000000000000000000000000000000:key/1234abcd")
            .responseMetadata(DefaultAwsResponseMetadata.create(mapOf(AwsHeader.AWS_REQUEST_ID to testRequestId)))
            .sdkHttpResponse(
                SdkHttpResponse.builder().headers(mapOf(CodeWhispererService.KET_SESSION_ID to listOf(testSessionId))).build()
            )
            .build() as CreateUploadUrlResponse
        val expectedSha256checksum: String =
            Base64.getEncoder().encodeToString(DigestUtils.sha256(FileInputStream(expectedFilePath.toAbsolutePath().toString())))
        clientAdaptorSpy.stub {
            onGeneric { clientAdaptorSpy.createGumbyUploadUrl(any()) }
                .thenReturn(gumbyUploadUrlResponse)
        }
        wireMock.stubFor(put(urlEqualTo("/")).willReturn(aResponse().withStatus(200)))
        testSessionSpy.uploadPayload(expectedFilePath.toFile())

        val inOrder = inOrder(clientAdaptorSpy)
        inOrder.verify(clientAdaptorSpy).createGumbyUploadUrl(eq(expectedSha256checksum))
        inOrder.verify(clientAdaptorSpy).uploadArtifactToS3(
            eq(gumbyUploadUrlResponse.uploadUrl()),
            eq(expectedFilePath.toFile()),
            eq(expectedSha256checksum),
            eq(gumbyUploadUrlResponse.kmsKeyArn()),
            any()
        )
    }

    @Test
    fun `Human in the loop will set and get download artifacts`() {
        val outputFolder = createTempDirectory("hilTest")
        val testZipFilePath = "humanInTheLoop/downloadResults.zip".toResourceFile().toPath()
        val hilDownloadArtifact = CodeTransformHilDownloadArtifact.create(testZipFilePath, outputFolder)

        // assert null before setting
        assertNull(testSessionSpy.getHilDownloadArtifact())
        testSessionSpy.setHilDownloadArtifact(hilDownloadArtifact)
        assertEquals(testSessionSpy.getHilDownloadArtifact(), hilDownloadArtifact)

        // cleanup
        outputFolder.delete()
    }

    @Test
    fun `Human in the loop will clean up download artifacts`() {
        val outputFolder = createTempDirectory("hilTest")
        val testZipFilePath = "humanInTheLoop/downloadResults.zip".toResourceFile().toPath()
        val hilDownloadArtifact = CodeTransformHilDownloadArtifact.create(testZipFilePath, outputFolder)
        testSessionSpy.setHilDownloadArtifact(hilDownloadArtifact)
        testSessionSpy.setHilTempDirectoryPath(outputFolder)
        assertTrue(outputFolder.exists())
        testSessionSpy.hilCleanup()
        assertFalse(outputFolder.exists())
    }
}
