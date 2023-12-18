// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.codemodernizer

import com.intellij.openapi.projectRoots.JavaSdkVersion
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.testFramework.LightVirtualFile
import com.intellij.testFramework.runInEdtAndWait
import junit.framework.TestCase.assertEquals
import junit.framework.TestCase.assertFalse
import junit.framework.TestCase.assertNotNull
import junit.framework.TestCase.assertNull
import kotlinx.coroutines.runBlocking
import org.junit.Before
import org.junit.Test
import org.mockito.Mockito
import org.mockito.Mockito.never
import org.mockito.Mockito.`when`
import org.mockito.kotlin.any
import org.mockito.kotlin.doNothing
import org.mockito.kotlin.doReturn
import org.mockito.kotlin.spy
import org.mockito.kotlin.times
import org.mockito.kotlin.verify
import org.mockito.kotlin.verifyNoMoreInteractions
import org.mockito.kotlin.whenever
import software.aws.toolkits.jetbrains.services.codemodernizer.ArtifactHandler
import software.aws.toolkits.jetbrains.services.codemodernizer.DownloadArtifactResult
import software.aws.toolkits.jetbrains.services.codemodernizer.filterOnlyParentFiles
import software.aws.toolkits.jetbrains.services.codemodernizer.model.CodeModernizerArtifact
import software.aws.toolkits.jetbrains.services.codemodernizer.model.CodeModernizerStartJobResult
import software.aws.toolkits.jetbrains.services.codemodernizer.model.CustomerSelection
import software.aws.toolkits.jetbrains.services.codemodernizer.model.InvalidTelemetryReason
import software.aws.toolkits.jetbrains.services.codemodernizer.model.ValidationResult
import software.aws.toolkits.jetbrains.services.codemodernizer.unzipFile
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.CodeTransformPreValidationError
import kotlin.io.path.Path
import kotlin.io.path.createTempDirectory
import kotlin.io.path.exists

class CodeWhispererCodeModernizerTest : CodeWhispererCodeModernizerTestBase() {

    @Before
    override fun setup() {
        super.setup()
    }

    @Test
    fun `test runModernize handles user cancelled dialog`() {
        doReturn(null).whenever(codeModernizerManagerSpy).getCustomerSelection(any())
        runInEdtAndWait {
            val buildFiles = listOf(emptyPomFile)
            val job = codeModernizerManagerSpy.runModernize(buildFiles)
            assertNull(job)
            verify(codeModernizerManagerSpy, times(1)).runModernize(buildFiles)
            verify(codeModernizerManagerSpy, times(1)).getCustomerSelection(buildFiles)
            // verify execution stopped after user cancelled
            verify(codeModernizerManagerSpy, times(0)).createCodeModernizerSession(any(), any())
            verify(codeModernizerManagerSpy, times(0)).launchModernizationJob(any())
            verify(codeModernizerManagerSpy, times(0)).postModernizationJob(any())
            verifyNoMoreInteractions(codeModernizerManagerSpy)
        }
    }

    @Test
    fun `test runModernize handles users completed dialog`() {
        var mockFile = Mockito.mock(VirtualFile::class.java)
        `when`(mockFile.name).thenReturn("pomx.xml")
        `when`(mockFile.path).thenReturn("/mocked/path/pom.xml")
        val selection = CustomerSelection(mockFile, JavaSdkVersion.JDK_1_8, JavaSdkVersion.JDK_17)
        doReturn(selection).whenever(codeModernizerManagerSpy).getCustomerSelection(any())
        doNothing().whenever(codeModernizerManagerSpy).postModernizationJob(any())
        doReturn(CodeModernizerStartJobResult.Started(jobId)).whenever(testSessionSpy).createModernizationJob()
        runInEdtAndWait {
            val buildFiles = listOf(emptyPomFile)
            val job = codeModernizerManagerSpy.runModernize(buildFiles)
            assertNotNull(job)
            verify(codeModernizerManagerSpy, times(1)).runModernize(buildFiles)
            verify(codeModernizerManagerSpy, times(1)).getCustomerSelection(buildFiles)
            verify(codeModernizerManagerSpy, times(1)).createCodeModernizerSession(any(), any())
            verify(codeModernizerManagerSpy, times(1)).launchModernizationJob(any())
        }
    }

    @Test
    fun `ArtifactHandler notifies users if patch does not exist`() = runBlocking {
        val handler = spy(ArtifactHandler(project, clientAdaptorSpy))
        val path = testCodeModernizerArtifact.zipPath
        doNothing().whenever(handler).notifyUnableToApplyPatch(path)
        val result = DownloadArtifactResult(null, path)
        doReturn(result).whenever(handler).downloadArtifact(any())
        handler.displayDiff(jobId)
        verify(handler, times(1)).notifyUnableToApplyPatch(path)
    }

    @Test
    fun `ArtifactHandler displays patch`() = runBlocking {
        val handler = spy(ArtifactHandler(project, clientAdaptorSpy))
        val path = testCodeModernizerArtifact.zipPath
        val result = DownloadArtifactResult(testCodeModernizerArtifact, path)
        doReturn(result).whenever(handler).downloadArtifact(any())
        doNothing().whenever(handler).displayDiffUsingPatch(any(), any())
        handler.displayDiff(jobId)
        verify(handler, never()).notifyUnableToApplyPatch(path)
        verify(handler, times(1)).displayDiffUsingPatch(testCodeModernizerArtifact.patch, jobId)
    }

    @Test
    fun `CodeModernizerArtifact can process a valid zip file`() {
        val artifact = CodeModernizerArtifact.create(exampleZipPath.toAbsolutePath().toString())
        assertEquals(validManifest, artifact.manifest)
        assertEquals(validTransformationSummary, artifact.summary)
    }

    @Test
    fun `can unzip a file`() {
        val tempDir = createTempDirectory()
        val result = unzipFile(exampleZipPath, tempDir)
        assert(result)
        assert(tempDir.resolve(validZipManifestPath).exists())
        assert(tempDir.resolve(validZipPatchFilePath).exists())
    }

    @Test
    fun `returns False when unable to unzip file`() {
        assertFalse(unzipFile(Path("dummy1"), Path("dummy2")))
    }

    @Test
    fun `able to filter roots correctly`() {
        val tests = listOf(
            setOf<String>() to listOf(),
            setOf("foo/bar") to listOf("foo/bar"),
            setOf("foo/bar", "foo/baz", "foo/bar/qux") to listOf("foo/bar", "foo/baz"),
            setOf("foos", "foo/bar", "foo/baz", "foo/bar/qux") to listOf("foos", "foo/bar", "foo/baz"),
            setOf("foo", "foo/bar", "foo/baz", "foo/bar/qux") to listOf("foo"),
        ).map { (input, expected) -> input.map { "$it/pom.xml" } to expected.map { "$it/pom.xml" } }
        tests.map { (input, expected) -> Pair(input.map { LightVirtualFile(it) }.toSet(), expected) }
            .forEach { (input, expected) ->
                assertEquals(expected, filterOnlyParentFiles(input).map { it.name })
            }
    }

    @Test
    fun `able to filter roots correctly when multiple on same level`() {
        val tests = listOf(
            setOf("foo/tmp0.txt", "foo/bar/tmp.txt", "foo/bar/tmp2.txt", "foo/bar/qux/tmp3.txt") to listOf("foo/tmp0.txt"),
            setOf("foo/bar/tmp.txt", "foo/bar/tmp2.txt", "foo/bar/qux/tmp3.txt") to listOf("foo/bar/tmp.txt", "foo/bar/tmp2.txt"),
        )
        tests.map { (input, expected) -> Pair(input.map { LightVirtualFile(it) }.toSet(), expected) }
            .forEach { (input, expected) ->
                assertEquals(expected, filterOnlyParentFiles(input).map { it.name })
            }
    }

    @Test
    fun `stopping job before JobId has been created notifies users that job can be stopped`() {
        codeModernizerManagerSpy.userInitiatedStopCodeModernization()
        verify(codeModernizerManagerSpy, times(1)).notifyTransformationStartStopping()
    }

    @Test
    fun `start transformation without IdC connection`() {
        val result = codeModernizerManagerSpy.validate(project)
        val expectedResult = ValidationResult(
            false,
            message("codemodernizer.notification.warn.invalid_project.description.reason.not_logged_in"),
            InvalidTelemetryReason(
                CodeTransformPreValidationError.NonSsoLogin
            )
        )
        assertEquals(expectedResult, result)
    }
}
