// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.codemodernizer

import com.github.tomakehurst.wiremock.client.WireMock.aResponse
import com.github.tomakehurst.wiremock.client.WireMock.put
import com.github.tomakehurst.wiremock.client.WireMock.urlEqualTo
import com.github.tomakehurst.wiremock.core.WireMockConfiguration
import com.github.tomakehurst.wiremock.junit.WireMockRule
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.projectRoots.JavaSdkVersion
import com.intellij.openapi.roots.ModuleRootManager
import com.intellij.testFramework.common.ThreadLeakTracker
import com.intellij.testFramework.runInEdtAndGet
import com.intellij.testFramework.runInEdtAndWait
import kotlinx.coroutines.runBlocking
import org.apache.commons.codec.digest.DigestUtils
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.fail
import org.gradle.internal.impldep.com.amazonaws.ResponseMetadata
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.mockito.Mockito.doReturn
import org.mockito.Mockito.mock
import org.mockito.Mockito.spy
import org.mockito.kotlin.any
import org.mockito.kotlin.atLeastOnce
import org.mockito.kotlin.doNothing
import org.mockito.kotlin.eq
import org.mockito.kotlin.inOrder
import org.mockito.kotlin.stub
import org.mockito.kotlin.times
import org.mockito.kotlin.verify
import org.mockito.kotlin.verifyNoMoreInteractions
import org.mockito.kotlin.whenever
import software.amazon.awssdk.awscore.DefaultAwsResponseMetadata
import software.amazon.awssdk.http.SdkHttpResponse
import software.amazon.awssdk.services.codewhispererruntime.model.CreateUploadUrlResponse
import software.amazon.awssdk.services.codewhispererruntime.model.TransformationStatus
import software.aws.toolkits.jetbrains.services.codemodernizer.model.CodeModernizerJobCompletedResult
import software.aws.toolkits.jetbrains.services.codemodernizer.model.CodeModernizerSessionContext
import software.aws.toolkits.jetbrains.services.codemodernizer.model.CodeModernizerStartJobResult
import software.aws.toolkits.jetbrains.services.codemodernizer.model.ZipCreationResult
import software.aws.toolkits.jetbrains.services.codewhisperer.CodeWhispererTestUtil
import software.aws.toolkits.jetbrains.services.codewhisperer.service.CodeWhispererService
import software.aws.toolkits.jetbrains.utils.rules.HeavyJavaCodeInsightTestFixtureRule
import software.aws.toolkits.jetbrains.utils.rules.addFileToModule
import java.io.File
import java.io.FileInputStream
import java.util.Base64
import java.util.zip.ZipFile
import kotlin.io.path.Path
import kotlin.test.assertNotNull

class CodeWhispererCodeModernizerSessionTest : CodeWhispererCodeModernizerTestBase(HeavyJavaCodeInsightTestFixtureRule()) {
    fun addFilesToProjectModule(vararg path: String) {
        val module = projectRule.module
        path.forEach { projectRule.fixture.addFileToModule(module, it, it) }
    }

    @Rule
    @JvmField
    val wireMock = WireMockRule(WireMockConfiguration.wireMockConfig().dynamicPort())

    @Before
    override fun setup() {
        super.setup()
        ThreadLeakTracker.longRunningThreadCreated(ApplicationManager.getApplication(), "Process Proxy: Launcher")
    }

    // when maven is not installed in the local machine and mvnw does not support this pom.xml
    @Test
    fun `CodeModernizerSessionContext shows the transformation hub once ide maven finishes`() {
        val module = projectRule.module
        val fileText = "Morning"
        projectRule.fixture.addFileToModule(module, "src/tmp.txt", fileText)

        // get project.projectFile because project.projectFile can not be null
        val roots = ModuleRootManager.getInstance(module).contentRoots
        val root = roots[0]
        val context = spy(CodeModernizerSessionContext(project, root.children[0], JavaSdkVersion.JDK_1_8, JavaSdkVersion.JDK_11))
        runInEdtAndWait {
            context.createZipWithModuleFiles().payload
            verify(context, times(1)).showTransformationHub()
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
        val codeContext = mock(CodeModernizerSessionContext::class.java)
        val mockFile = mock(File::class.java)
        val mockStringBUilder = mock(StringBuilder::class.java)
        whenever(codeContext.runMavenCommand(mockFile, mockStringBUilder)).thenReturn(mock(File::class.java))
        val file = runInEdtAndGet {
            context.createZipWithModuleFiles().payload
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
        val codeContext = mock(CodeModernizerSessionContext::class.java)
        val mockFile = mock(File::class.java)
        val mockStringBUilder = mock(StringBuilder::class.java)
        whenever(codeContext.runMavenCommand(mockFile, mockStringBUilder)).thenReturn(mock(File::class.java))
        val file = runInEdtAndGet {
            context.createZipWithModuleFiles().payload
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
        val file = runInEdtAndGet {
            context.createZipWithModuleFiles().payload
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
        val file = runInEdtAndGet {
            context.createZipWithModuleFiles().payload
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
        val file = runInEdtAndGet {
            context.createZipWithModuleFiles().payload
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
        val file = runInEdtAndGet {
            context.createZipWithModuleFiles().payload
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
            .responseMetadata(DefaultAwsResponseMetadata.create(mapOf(ResponseMetadata.AWS_REQUEST_ID to CodeWhispererTestUtil.testRequestId)))
            .sdkHttpResponse(
                SdkHttpResponse.builder().headers(mapOf(CodeWhispererService.KET_SESSION_ID to listOf(CodeWhispererTestUtil.testSessionId))).build()
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

        val inOrder = inOrder(testSessionSpy)
        inOrder.verify(testSessionSpy).uploadArtifactToS3(
            eq(gumbyUploadUrlResponse.uploadUrl()),
            eq(expectedFilePath.toFile()),
            eq(expectedSha256checksum),
            eq(gumbyUploadUrlResponse.kmsKeyArn())
        )
    }
}
