// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.tools

import com.intellij.openapi.application.ApplicationManager
import com.intellij.testFramework.ApplicationRule
import com.intellij.testFramework.runInEdtAndWait
import org.assertj.core.api.Assertions.assertThat
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import org.mockito.kotlin.KStubbing
import org.mockito.kotlin.any
import org.mockito.kotlin.doAnswer
import org.mockito.kotlin.doReturn
import org.mockito.kotlin.doThrow
import org.mockito.kotlin.mock
import org.mockito.kotlin.stub
import org.mockito.kotlin.times
import org.mockito.kotlin.verify
import software.aws.toolkits.core.utils.test.aString
import software.aws.toolkits.jetbrains.utils.assertIsNonDispatchThread
import software.aws.toolkits.jetbrains.utils.isInstanceOf
import software.aws.toolkits.jetbrains.utils.isInstanceOfSatisfying
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.attribute.FileTime
import java.time.Instant

class ToolManagerTest {
    @Rule
    @JvmField
    val application = ApplicationRule()

    @Rule
    @JvmField
    val tempFolder = TemporaryFolder()

    private lateinit var sut: ToolManager

    @Before
    fun setUp() {
        sut = ToolManager.getInstance()
    }

    @Test
    fun `a configured tool overrides a detected tool`() {
        val type = createDetectableMock {
            on { resolve() } doReturn Path.of(aString())
        }
        val savedPath = aString()
        ToolSettings.getInstance().setExecutablePath(type, savedPath)

        assertThat(sut.getTool(type)?.path?.toString()).isEqualTo(savedPath)
    }

    @Test
    fun `a detectable tool can be detected if not explicitly configured`() {
        val path = Path.of(aString())
        val type = createDetectableMock {
            on { resolve() } doReturn path
        }

        assertThat(sut.getTool(type)?.path).isEqualTo(path)
    }

    @Test
    fun `a detectable tool not found returns null`() {
        val type = createDetectableMock {
            on { resolve() } doReturn null
        }

        assertThat(sut.getTool(type)?.path).isNull()
    }

    @Test
    fun `an undetectable tool not configured returns null`() {
        val type = createUndetectableMock()

        assertThat(sut.getTool(type)?.path).isNull()
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

            val tool = sut.getTool(type, tempFolder.newFile().toPath())
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

            val tool = sut.getTool(type, tempFolder.newFile().toPath())
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

        val tool = sut.getTool(type, tempFolder.newFile().toPath())
        assertThat(sut.validateCompatability(tool = tool)).isInstanceOf<Validity.Valid>()
    }

    @Test
    fun `validation on a path that does not exist is NotInstalled`() {
        val type = createUndetectableMock {
            on { determineVersion(any()) } doReturn SemanticVersion(1, 2, 3)
        }

        val tool = sut.getTool(type, Path.of(aString()))
        assertThat(sut.validateCompatability(tool = tool)).isInstanceOf<Validity.NotInstalled>()
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

        val tool = sut.getTool(type, tempFolder.newFile().toPath())

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

        val tool = sut.getTool(type, tempFolder.newFile().toPath())
        val validity = sut.validateCompatability(tool = tool)
        assertThat(validity).isInstanceOfSatisfying<Validity.NotInstalled> {
            assertThat(it.detailedMessage).isEqualTo(error.message)
        }
    }

    @Test
    fun `an error while validating is idempotent`() {
        val type = createUndetectableMock {
            on { determineVersion(any()) } doThrow IllegalStateException("fake error occurred") doReturn SemanticVersion(1, 2, 3)
        }

        val tool = sut.getTool(type, tempFolder.newFile().toPath())

        assertThat(sut.validateCompatability(tool = tool)).isInstanceOf<Validity.NotInstalled>()
        assertThat(sut.validateCompatability(tool = tool)).isInstanceOf<Validity.NotInstalled>()

        verify(type, times(1)).determineVersion(any())
    }

    @Test
    fun `calling validate revalidates if file is modified`() {
        runInEdtAndWait {
            val type = createUndetectableMock {
                on { determineVersion(any()) } doReturn SemanticVersion(1, 2, 3)
            }

            val tool = sut.getTool(type, tempFolder.newFile().toPath())
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

        val tool = sut.getTool(type, tempFolder.newFile().toPath())

        assertThat(sut.validateCompatability(tool = tool, stricterMinVersion = SemanticVersion(2, 0, 0))).isInstanceOf<Validity.VersionTooNew>()
    }

    @Test
    fun `a version too low returns VersionTooOld`() {
        val type = createUndetectableMock {
            on { determineVersion(any()) } doReturn SemanticVersion(1, 2, 3)
            on { supportedVersions() } doReturn (SemanticVersion(2, 0, 0) until SemanticVersion(3, 0, 0))
        }

        val tool = sut.getTool(type, tempFolder.newFile().toPath())

        assertThat(sut.validateCompatability(tool = tool, stricterMinVersion = SemanticVersion(2, 0, 0))).isInstanceOf<Validity.VersionTooOld>()
    }

    @Test
    fun `a stricter min version can be applied`() {
        val type = createUndetectableMock {
            on { determineVersion(any()) } doReturn SemanticVersion(1, 2, 3)
            on { supportedVersions() } doReturn (SemanticVersion(1, 0, 0) until SemanticVersion(3, 0, 0))
        }

        val tool = sut.getTool(type, tempFolder.newFile().toPath())

        assertThat(sut.validateCompatability(tool = tool, stricterMinVersion = SemanticVersion(2, 0, 0))).isInstanceOf<Validity.VersionTooOld>()
    }

    private fun createUndetectableMock(toolId: String = aString(), stubBuilder: (KStubbing<ToolType<SemanticVersion>>).() -> Unit = {}) =
        mock<ToolType<SemanticVersion>>()
            .stub {
                on { id }.thenReturn(toolId)
                stubBuilder(this)
            }

    private fun createDetectableMock(toolId: String = aString(), stubBuilder: (KStubbing<AutoDetectableTool<SemanticVersion>>).() -> Unit = {}) =
        mock<AutoDetectableTool<SemanticVersion>>()
            .stub {
                on { id } doReturn toolId
                stubBuilder(this)
            }
}
