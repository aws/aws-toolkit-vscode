// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.tools

import com.intellij.openapi.application.ApplicationManager
import com.intellij.testFramework.ApplicationRule
import com.intellij.testFramework.runInEdtAndWait
import com.intellij.util.io.write
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import org.mockito.kotlin.KStubbing
import org.mockito.kotlin.any
import org.mockito.kotlin.anyOrNull
import org.mockito.kotlin.doAnswer
import org.mockito.kotlin.doReturn
import org.mockito.kotlin.doReturnConsecutively
import org.mockito.kotlin.doThrow
import org.mockito.kotlin.eq
import org.mockito.kotlin.mock
import org.mockito.kotlin.never
import org.mockito.kotlin.reset
import org.mockito.kotlin.stub
import org.mockito.kotlin.times
import org.mockito.kotlin.verify
import org.mockito.stubbing.Answer
import software.aws.toolkits.core.utils.test.aString
import software.aws.toolkits.jetbrains.core.tools.DefaultToolManager.Companion.managedToolInstallDir
import software.aws.toolkits.jetbrains.core.tools.DefaultToolManager.Companion.managedToolMarkerFile
import software.aws.toolkits.jetbrains.utils.assertIsNonDispatchThread
import software.aws.toolkits.jetbrains.utils.isInstanceOf
import software.aws.toolkits.jetbrains.utils.isInstanceOfSatisfying
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.ToolId
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.attribute.FileTime
import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

class ToolManagerTest {
    @Rule
    @JvmField
    val application = ApplicationRule()

    @Rule
    @JvmField
    val tempFolder = TemporaryFolder()

    private lateinit var sut: DefaultToolManager
    private lateinit var clock: Clock

    @Before
    fun setUp() {
        clock = mock {
            on { instant() } doReturn Instant.MIN
        }
        sut = DefaultToolManager(clock)
    }

    @Test
    fun `a configured tool overrides a detected tool`() {
        val type = createDetectableMock {
            on { resolve() } doReturn Path.of(aString())
        }
        val savedPath = aString()
        ToolSettings.getInstance().setExecutablePath(type, savedPath)

        assertThat(sut.getTool(type = type)?.path?.toString()).isEqualTo(savedPath)
    }

    @Test
    fun `a detectable tool can be detected if not explicitly configured`() {
        val path = Path.of(aString())
        val type = createDetectableMock {
            on { resolve() } doReturn path
        }

        assertThat(sut.getTool(type = type)?.path).isEqualTo(path)
    }

    @Test
    fun `a detectable tool not found returns null`() {
        val type = createDetectableMock {
            on { resolve() } doReturn null
        }

        assertThat(sut.getTool(type = type)?.path).isNull()
    }

    @Test
    fun `an undetectable tool not configured returns null`() {
        val type = createUndetectableMock()

        assertThat(sut.getTool(type = type)?.path).isNull()
    }

    @Test
    fun `validating from the UI thread does not run on the UI thread`() {
        runInEdtAndWait {
            val type = createUndetectableMock {
                on { determineVersion(any()) } doAnswer {
                    assertIsNonDispatchThread()
                    SemanticVersion(1, 2, 3)
                }
            }

            val tool = sut.getToolForPath(type, tempFolder.newFile().toPath())
            sut.validateCompatability(tool = tool)
        }
    }

    @Test
    fun `validating can be performed from a non-UI thread`() {
        ApplicationManager.getApplication().executeOnPooledThread {
            val type = createUndetectableMock {
                on { determineVersion(any()) } doAnswer {
                    assertIsNonDispatchThread()
                    SemanticVersion(1, 2, 3)
                }
            }

            val tool = sut.getToolForPath(type, tempFolder.newFile().toPath())
            sut.validateCompatability(tool = tool)
        }.get()
    }

    @Test
    fun `validation can be performed on a path`() {
        val type = createUndetectableMock {
            on { determineVersion(any()) } doReturn SemanticVersion(1, 2, 3)
        }

        assertThat(sut.validateCompatability(path = tempFolder.newFile().toPath(), type = type)).isInstanceOf<Validity.Valid>()
    }

    @Test
    fun `validation can be performed on a tool instance`() {
        val type = createUndetectableMock {
            on { determineVersion(any()) } doReturn SemanticVersion(1, 2, 3)
        }

        val tool = sut.getToolForPath(type, tempFolder.newFile().toPath())
        assertThat(sut.validateCompatability(tool = tool)).isInstanceOf<Validity.Valid>()
    }

    @Test
    fun `validation on a path that does not exist is NotInstalled`() {
        val type = createUndetectableMock {
            on { determineVersion(any()) } doReturn SemanticVersion(1, 2, 3)
        }

        val tool = sut.getToolForPath(type, Path.of(aString()))
        assertThat(sut.validateCompatability(tool = tool)).isInstanceOf<Validity.ValidationFailed>()
    }

    @Test
    fun `validation on a null tool is NotInstalled`() {
        assertThat(sut.validateCompatability<SemanticVersion>(tool = null)).isInstanceOf<Validity.NotInstalled>()
    }

    @Test
    fun `calling validate multiple times with no change hits cache`() {
        val type = createUndetectableMock {
            on { determineVersion(any()) } doReturn SemanticVersion(1, 2, 3)
        }

        val tool = sut.getToolForPath(type, tempFolder.newFile().toPath())

        sut.validateCompatability(tool = tool)
        sut.validateCompatability(tool = tool)
        sut.validateCompatability(tool = tool)

        verify(type, times(1)).determineVersion(any())
    }

    @Test
    fun `an error while validating is considered not installed`() {
        val error = IllegalStateException("fake error occurred")
        val type = createUndetectableMock {
            on { determineVersion(any()) } doThrow error
        }

        val tool = sut.getToolForPath(type, tempFolder.newFile().toPath())
        val validity = sut.validateCompatability(tool = tool)
        assertThat(validity).isInstanceOfSatisfying<Validity.ValidationFailed> {
            assertThat(it.detailedMessage).isEqualTo(error.message)
        }
    }

    @Test
    fun `an error while validating is idempotent`() {
        val type = createUndetectableMock {
            on { determineVersion(any()) } doThrow IllegalStateException("fake error occurred") doReturn SemanticVersion(1, 2, 3)
        }

        val tool = sut.getToolForPath(type, tempFolder.newFile().toPath())

        assertThat(sut.validateCompatability(tool = tool)).isInstanceOf<Validity.ValidationFailed>()
        assertThat(sut.validateCompatability(tool = tool)).isInstanceOf<Validity.ValidationFailed>()

        verify(type, times(1)).determineVersion(any())
    }

    @Test
    fun `calling validate revalidates if file is modified`() {
        runInEdtAndWait {
            val type = createUndetectableMock {
                on { determineVersion(any()) } doReturn SemanticVersion(1, 2, 3)
            }

            val tool = sut.getToolForPath(type, tempFolder.newFile().toPath())
            Files.setLastModifiedTime(tool.path, FileTime.from(Instant.now().minusSeconds(10)))
            sut.validateCompatability(tool = tool)

            Files.setLastModifiedTime(tool.path, FileTime.from(Instant.now()))
            sut.validateCompatability(tool = tool)

            verify(type, times(2)).determineVersion(any())
        }
    }

    @Test
    fun `a version new low returns VersionTooNew`() {
        val type = createUndetectableMock {
            on { determineVersion(any()) } doReturn SemanticVersion(2, 3, 4)
            on { supportedVersions() } doReturn (SemanticVersion(1, 0, 0) until SemanticVersion(2, 0, 0))
        }

        val tool = sut.getToolForPath(type, tempFolder.newFile().toPath())

        assertThat(sut.validateCompatability(tool = tool, stricterMinVersion = SemanticVersion(2, 0, 0))).isInstanceOf<Validity.VersionTooNew>()
    }

    @Test
    fun `a version too low returns VersionTooOld`() {
        val type = createUndetectableMock {
            on { determineVersion(any()) } doReturn SemanticVersion(1, 2, 3)
            on { supportedVersions() } doReturn (SemanticVersion(2, 0, 0) until SemanticVersion(3, 0, 0))
        }

        val tool = sut.getToolForPath(type, tempFolder.newFile().toPath())

        assertThat(sut.validateCompatability(tool = tool, stricterMinVersion = SemanticVersion(2, 0, 0))).isInstanceOf<Validity.VersionTooOld>()
    }

    @Test
    fun `a stricter min version can be applied`() {
        val type = createUndetectableMock {
            on { determineVersion(any()) } doReturn SemanticVersion(1, 2, 3)
            on { supportedVersions() } doReturn (SemanticVersion(1, 0, 0) until SemanticVersion(3, 0, 0))
        }

        val tool = sut.getToolForPath(type, tempFolder.newFile().toPath())

        assertThat(sut.validateCompatability(tool = tool, stricterMinVersion = SemanticVersion(2, 0, 0))).isInstanceOf<Validity.VersionTooOld>()
    }

    @Test
    fun `a managed tool will be installed if not installed`() {
        val downloadFile = tempFolder.newFile().toPath()
        val toolId = aString()
        val version = SemanticVersion(1, 2, 3)
        val markerFile = managedToolMarkerFile(toolId)
        val installPath = managedToolInstallDir(toolId, version.displayValue())
        val toolBinary = installPath.resolve("myExe")
        val type = createManagedToolMock(toolId) {
            on { determineLatestVersion() } doReturn version
            on { downloadVersion(eq(version), any(), anyOrNull()) } doReturn downloadFile
            on { toTool(eq(installPath)) } doReturn Tool(this.mock, toolBinary)
        }

        assertThat(markerFile).doesNotExist()
        assertThat(installPath).doesNotExist()
        assertThat(sut.getOrInstallTool(type).path).isEqualTo(toolBinary)
        assertThat(markerFile).hasContent(version.displayValue())

        verify(type).determineLatestVersion()
        verify(type).downloadVersion(any(), any(), anyOrNull())
        verify(type).installVersion(eq(downloadFile), eq(installPath), anyOrNull())
        verify(type).toTool(eq(installPath))
    }

    @Test
    fun `a managed tool will be returned if installed`() {
        val toolId = aString()
        val version = SemanticVersion(1, 2, 3)
        val markerFile = managedToolMarkerFile(toolId)
        val installPath = managedToolInstallDir(toolId, version.displayValue())
        val toolBinary = installPath.resolve("myExe")
        val type = createManagedToolMock(toolId) {
            on { toTool(eq(installPath)) } doReturn Tool(this.mock, toolBinary)
        }

        markerFile.write(version.displayValue())
        toolBinary.write("aFile")
        assertThat(sut.getOrInstallTool(type).path).isEqualTo(toolBinary)

        verify(type, never()).determineLatestVersion()
        verify(type, never()).downloadVersion(any(), any(), anyOrNull())
    }

    @Test
    fun `a managed tool with corrupt marker will be treated as not installed`() {
        listOf("deadPointer", "../1.2.3", "..\\1.2.3").forEach {
            val downloadFile = tempFolder.newFile().toPath()
            val toolId = aString()
            val version = SemanticVersion(1, 2, 3)
            val markerFile = managedToolMarkerFile(toolId)
            val installPath = managedToolInstallDir(toolId, version.displayValue())
            val toolBinary = installPath.resolve("myExe")
            val type = createManagedToolMock(toolId) {
                on { determineLatestVersion() } doReturn version
                on { downloadVersion(eq(version), any(), anyOrNull()) } doReturn downloadFile
                on { toTool(eq(installPath)) } doReturn Tool(this.mock, toolBinary)
            }

            markerFile.write(it)
            assertThat(sut.getOrInstallTool(type).path).isEqualTo(toolBinary)
            assertThat(markerFile).hasContent(version.displayValue())

            verify(type).determineLatestVersion()
            verify(type).downloadVersion(any(), any(), anyOrNull())
            verify(type).installVersion(eq(downloadFile), eq(installPath), anyOrNull())
            verify(type).toTool(eq(installPath))
        }
    }

    @Test
    fun `a managed tool install clears out its install location first`() {
        val downloadFile = tempFolder.newFile().toPath()
        val toolId = aString()
        val version = SemanticVersion(1, 2, 3)
        val markerFile = managedToolMarkerFile(toolId)
        val installPath = managedToolInstallDir(toolId, version.displayValue())
        val toolBinary = installPath.resolve("myExe")
        val type = createManagedToolMock(toolId) {
            on { determineLatestVersion() } doReturn version
            on { downloadVersion(eq(version), any(), anyOrNull()) } doReturn downloadFile
            on { toTool(eq(installPath)) } doReturn Tool(this.mock, toolBinary)
        }

        assertThat(markerFile).doesNotExist()
        val oldFile = installPath.resolve("someFile").write("hello")
        assertThat(sut.getOrInstallTool(type).path).isEqualTo(toolBinary)
        assertThat(oldFile).doesNotExist()
    }

    @Test
    fun `a managed tool can be updated`() {
    }

    @Test
    fun `only one managed tool can be installed at a time`() {
    }

    @Test
    fun `old managed tool versions are cleaned up`() {
    }

    @Test
    fun `a managed tool that fails to install bubbles up`() {
        val downloadFile = tempFolder.newFile().toPath()
        val toolId = aString()
        val version = SemanticVersion(1, 2, 3)
        val markerFile = managedToolMarkerFile(toolId)
        val installPath = managedToolInstallDir(toolId, version.displayValue())
        val error = IllegalStateException("Boom!")
        val type = createManagedToolMock(toolId) {
            on { determineLatestVersion() } doReturn version
            on { downloadVersion(eq(version), any(), anyOrNull()) } doReturn downloadFile
            on { installVersion(any(), any(), anyOrNull()) } doThrow error
        }

        assertThat(markerFile).doesNotExist()
        assertThat(installPath).doesNotExist()
        assertThatThrownBy { sut.getOrInstallTool(type) }
            .hasMessage(message("executableCommon.failed_install", type.displayName))
            .hasRootCause(error)
        assertThat(markerFile).doesNotExist()

        verify(type).determineLatestVersion()
        verify(type).downloadVersion(any(), any(), anyOrNull())
        verify(type).installVersion(any(), any(), anyOrNull())
    }

    @Test
    fun `managed tool update checks respect TTL`() {
        val toolId = aString()
        val version = SemanticVersion(1, 2, 3)
        val markerFile = managedToolMarkerFile(toolId)
        val installPath = managedToolInstallDir(toolId, version.displayValue())
        val toolBinary = installPath.resolve("myExe")
        val now = Instant.now()
        // Clear out default mock
        reset(clock)
        clock.stub {
            on { instant() } doReturnConsecutively listOf(
                now.plus(Duration.ofDays(7)),
                now.plus(Duration.ofDays(7).plusHours(1)),
                now.plus(Duration.ofDays(9))
            )
        }

        val type = createManagedToolMock(toolId) {
            on { determineLatestVersion() } doReturn version
            on { toTool(eq(installPath)) } doReturn Tool(this.mock, toolBinary)
            on { determineVersion(eq(toolBinary)) } doReturn version
        }

        markerFile.write(version.displayValue())
        toolBinary.write("someExe")
        sut.checkForUpdates(type)
        sut.checkForUpdates(type)
        sut.checkForUpdates(type)

        verify(type, times(2)).determineLatestVersion()
    }

    @Test
    fun `managed tool checks for updates when retrieved non-blocking`() {
        val toolId = aString()
        val version = SemanticVersion(1, 2, 3)
        val markerFile = managedToolMarkerFile(toolId)
        val installPath = managedToolInstallDir(toolId, version.displayValue())
        val toolBinary = installPath.resolve("myExe")
        val latch = CountDownLatch(1)
        val postCheckLatch = CountDownLatch(1)
        // Clear out default mock
        reset(clock)
        clock.stub {
            on { instant() } doReturn Instant.MAX
        }

        val type = createManagedToolMock(toolId) {
            on { determineLatestVersion() } doAnswer Answer<Version> {
                latch.countDown()
                postCheckLatch.await()
                version
            }
            on { toTool(eq(installPath)) } doReturn Tool(this.mock, toolBinary)
        }

        markerFile.write(version.displayValue())
        toolBinary.write("aFile")

        sut.getTool(type)

        postCheckLatch.countDown()

        assertThat(latch.await(5, TimeUnit.SECONDS)).isTrue
    }

    @Test
    fun `a managed tool with no supporting version can't be installed`() {
        val toolId = aString()
        val markerFile = managedToolMarkerFile(toolId)
        val supportedRange = SemanticVersion(1, 0, 0) until SemanticVersion(2, 0, 0)
        val type = createManagedToolMock(toolId) {
            on { determineLatestVersion() } doReturn SemanticVersion(3, 0, 0)
            on { supportedVersions() } doReturn supportedRange
        }

        assertThat(markerFile).doesNotExist()
        assertThatThrownBy { sut.getOrInstallTool(type) }
            .hasMessage(message("executableCommon.failed_install", type.displayName))
            .hasRootCauseMessage(message("executableCommon.latest_not_compatible", type.displayName, supportedRange.displayValue()))
    }

    @Test
    fun `a managed tool with unsupported newer version won't update to it`() {
        val toolId = aString()
        val version = SemanticVersion(1, 2, 3)
        val markerFile = managedToolMarkerFile(toolId)
        val supportedRange = SemanticVersion(1, 0, 0) until SemanticVersion(2, 0, 0)

        // Clear out default mock
        reset(clock)
        clock.stub {
            on { instant() } doReturn Instant.MAX
        }

        val type = createManagedToolMock(toolId) {
            on { determineLatestVersion() } doReturn SemanticVersion(3, 0, 0)
            on { supportedVersions() } doReturn supportedRange
        }

        markerFile.write(version.displayValue())
        sut.checkForUpdates(type)

        verify(type).determineLatestVersion()
        verify(type, never()).downloadVersion(any(), any(), anyOrNull())
        verify(type, never()).installVersion(any(), any(), anyOrNull())
    }

    @Test
    fun `a managed tool with same latest newer version won't update to it`() {
        val toolId = aString()
        val version = SemanticVersion(1, 2, 3)
        val markerFile = managedToolMarkerFile(toolId)
        val supportedRange = SemanticVersion(1, 0, 0) until SemanticVersion(2, 0, 0)
        val installPath = managedToolInstallDir(toolId, version.displayValue())
        val toolBinary = installPath.resolve("myExe")

        // Clear out default mock
        reset(clock)
        clock.stub {
            on { instant() } doReturn Instant.MAX
        }

        val type = createManagedToolMock(toolId) {
            on { determineLatestVersion() } doReturn version
            on { supportedVersions() } doReturn supportedRange
            on { toTool(eq(installPath)) } doReturn Tool(this.mock, toolBinary)
            on { determineVersion(eq(toolBinary)) } doReturn version
        }

        markerFile.write(version.displayValue())
        toolBinary.write("someExe")
        sut.checkForUpdates(type)

        verify(type).determineLatestVersion()
        verify(type, never()).downloadVersion(any(), any(), anyOrNull())
        verify(type, never()).installVersion(any(), any(), anyOrNull())
    }

    private fun createUndetectableMock(toolId: String = aString(), stubBuilder: (KStubbing<ToolType<SemanticVersion>>).() -> Unit = {}) =
        mock<ToolType<SemanticVersion>>()
            .stub {
                on { id } doReturn toolId
                on { displayName } doReturn toolId
                stubBuilder(this)
            }

    private fun createDetectableMock(toolId: String = aString(), stubBuilder: (KStubbing<AutoDetectableToolType<SemanticVersion>>).() -> Unit = {}) =
        mock<AutoDetectableToolType<SemanticVersion>>()
            .stub {
                on { id } doReturn toolId
                on { displayName } doReturn toolId
                stubBuilder(this)
            }

    private fun createManagedToolMock(toolId: String = aString(), stubBuilder: (KStubbing<ManagedToolType<SemanticVersion>>).() -> Unit = {}) =
        mock<ManagedToolType<SemanticVersion>>(verboseLogging = true)
            .stub {
                on { id } doReturn toolId
                on { telemetryId } doReturn ToolId.Unknown
                on { displayName } doReturn toolId
                stubBuilder(this)
            }
}
