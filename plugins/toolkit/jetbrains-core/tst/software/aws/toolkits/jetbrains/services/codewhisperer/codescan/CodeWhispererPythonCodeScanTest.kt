// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.codescan

import com.intellij.openapi.vfs.VirtualFile
import org.assertj.core.api.Assertions.assertThat
import org.junit.Before
import org.junit.Test
import org.mockito.kotlin.any
import org.mockito.kotlin.spy
import org.mockito.kotlin.stub
import software.aws.toolkits.jetbrains.services.codewhisperer.codescan.sessionconfig.CodeScanSessionConfig
import software.aws.toolkits.jetbrains.services.codewhisperer.codescan.sessionconfig.PythonCodeScanSessionConfig
import software.aws.toolkits.jetbrains.utils.rules.PythonCodeInsightTestFixtureRule
import software.aws.toolkits.telemetry.CodewhispererLanguage
import java.io.BufferedInputStream
import java.util.zip.ZipInputStream
import kotlin.io.path.relativeTo
import kotlin.test.assertNotNull

class CodeWhispererPythonCodeScanTest : CodeWhispererCodeScanTestBase(PythonCodeInsightTestFixtureRule()) {
    private lateinit var testPy: VirtualFile
    private lateinit var utilsPy: VirtualFile
    private lateinit var helperPy: VirtualFile
    private lateinit var sessionConfigSpy: PythonCodeScanSessionConfig

    private var totalSize: Long = 0
    private var totalLines: Long = 0

    @Before
    override fun setup() {
        super.setup()
        setupPythonProject()
        sessionConfigSpy = spy(CodeScanSessionConfig.create(testPy, project) as PythonCodeScanSessionConfig)
        setupResponse(testPy.toNioPath().relativeTo(sessionConfigSpy.projectRoot.toNioPath()))

        mockClient.stub {
            onGeneric { createUploadUrl(any()) }.thenReturn(fakeCreateUploadUrlResponse)
            onGeneric { createCodeScan(any(), any()) }.thenReturn(fakeCreateCodeScanResponse)
            onGeneric { getCodeScan(any(), any()) }.thenReturn(fakeGetCodeScanResponse)
            onGeneric { listCodeScanFindings(any(), any()) }.thenReturn(fakeListCodeScanFindingsResponse)
        }
    }

    @Test
    fun `test createPayload`() {
        val payload = sessionConfigSpy.createPayload()
        assertNotNull(payload)
        assertThat(payload.context.totalFiles).isEqualTo(3)

        assertThat(payload.context.scannedFiles.size).isEqualTo(3)
        assertThat(payload.context.scannedFiles).containsExactly(testPy, utilsPy, helperPy)

        assertThat(payload.context.srcPayloadSize).isEqualTo(totalSize)
        assertThat(payload.context.language).isEqualTo(CodewhispererLanguage.Python)
        assertThat(payload.context.totalLines).isEqualTo(totalLines)
        assertNotNull(payload.srcZip)

        val bufferedInputStream = BufferedInputStream(payload.srcZip.inputStream())
        val zis = ZipInputStream(bufferedInputStream)
        var filesInZip = 0
        while (zis.nextEntry != null) {
            filesInZip += 1
        }

        assertThat(filesInZip).isEqualTo(3)
    }

    @Test
    fun `test getSourceFilesUnderProjectRoot`() {
        getSourceFilesUnderProjectRoot(sessionConfigSpy, testPy, 3)
    }

    @Test
    fun `test parseImport()`() {
        val testPyImports = sessionConfigSpy.parseImports(testPy)
        assertThat(testPyImports.size).isEqualTo(4)

        val helperPyImports = sessionConfigSpy.parseImports(helperPy)
        assertThat(helperPyImports.size).isEqualTo(1)
    }

    @Test
    fun `test getImportedFiles()`() {
        val files = sessionConfigSpy.getImportedFiles(testPy, setOf())
        assertNotNull(files)
        assertThat(files).hasSize(2)
        assertThat(files).contains(utilsPy.path)
        assertThat(files).contains(helperPy.path)
    }

    @Test
    fun `test includeDependencies()`() {
        includeDependencies(sessionConfigSpy, 3, totalSize, this.totalLines, 0)
    }

    @Test
    fun `test getTotalProjectSizeInBytes()`() {
        getTotalProjectSizeInBytes(sessionConfigSpy, this.totalSize)
    }

    @Test
    fun `selected file larger than payload limit throws exception`() {
        selectedFileLargerThanPayloadSizeThrowsException(sessionConfigSpy)
    }

    @Test
    fun `test createPayload with custom payload limit`() {
        sessionConfigSpy.stub {
            onGeneric { getPayloadLimitInBytes() }.thenReturn(900)
        }
        val payload = sessionConfigSpy.createPayload()
        assertNotNull(payload)
        assertThat(sessionConfigSpy.isProjectTruncated()).isTrue
        assertThat(payload.context.totalFiles).isEqualTo(2)

        assertThat(payload.context.scannedFiles.size).isEqualTo(2)
        assertThat(payload.context.scannedFiles).containsExactly(testPy, helperPy)

        assertThat(payload.context.srcPayloadSize).isEqualTo(363)
        assertThat(payload.context.language).isEqualTo(CodewhispererLanguage.Python)
        assertThat(payload.context.totalLines).isEqualTo(18)
        assertNotNull(payload.srcZip)

        val bufferedInputStream = BufferedInputStream(payload.srcZip.inputStream())
        val zis = ZipInputStream(bufferedInputStream)
        var filesInZip = 0
        while (zis.nextEntry != null) {
            filesInZip += 1
        }

        assertThat(filesInZip).isEqualTo(2)
    }

    @Test
    fun `test createPayload for file outside project`() {
        val fileOutsideProjectPy = projectRule.fixture.addFileToProject(
            "../fileOutsideProject.py",
            """
                import numpy as np
                import util
                a = 1
                """
        ).virtualFile
        val totalSize = fileOutsideProjectPy.length
        val totalLines = fileOutsideProjectPy.toNioPath().toFile().readLines().size.toLong()
        sessionConfigSpy = spy(CodeScanSessionConfig.create(fileOutsideProjectPy, project) as PythonCodeScanSessionConfig)

        val payload = sessionConfigSpy.createPayload()
        assertNotNull(payload)
        assertThat(payload.context.totalFiles).isEqualTo(1)

        assertThat(payload.context.scannedFiles.size).isEqualTo(1)
        assertThat(payload.context.scannedFiles).containsExactly(fileOutsideProjectPy)

        assertThat(payload.context.srcPayloadSize).isEqualTo(totalSize)
        assertThat(payload.context.language).isEqualTo(CodewhispererLanguage.Python)
        assertThat(payload.context.totalLines).isEqualTo(totalLines)
        assertNotNull(payload.srcZip)

        val bufferedInputStream = BufferedInputStream(payload.srcZip.inputStream())
        val zis = ZipInputStream(bufferedInputStream)
        var filesInZip = 0
        while (zis.nextEntry != null) {
            filesInZip += 1
        }

        assertThat(filesInZip).isEqualTo(1)
    }

    @Test
    fun `e2e happy path integration test`() {
        assertE2ERunsSuccessfully(sessionConfigSpy, project, totalLines, 3, totalSize, 2)
    }

    private fun setupPythonProject() {
        testPy = projectRule.fixture.addFileToProject(
            "/test.py",
            """
            import numpy as np
            import utils
            import helpers.helper
            import test2

            a = 1
            b = 2
            print(utils.add(a, b))
            println(helper.subtract(a, b))
            println(utils.fib(5))
            """.trimIndent()
        ).virtualFile
        totalSize += testPy.length
        totalLines += testPy.toNioPath().toFile().readLines().size

        utilsPy = projectRule.fixture.addFileToProject(
            "/utils.py",
            """
            def add(num1, num2
                return num1 + num2

            def multiply(num1, num2)
                return num1 * num2

            def divide(num1, num2)
                return num1 / num2

            def bubbleSort(arr):
            	n = len(arr)
            	# optimize code, so if the array is already sorted, it doesn't need
            	# to go through the entire process
            	swapped = False
            	# Traverse through all array elements
            	for i in range(n-1):
            		# range(n) also work but outer loop will
            		# repeat one time more than needed.
            		# Last i elements are already in place
            		for j in range(0, n-i-1):

            			# traverse the array from 0 to n-i-1
            			# Swap if the element found is greater
            			# than the next element
            			if arr[j] > arr[j + 1]:
            				swapped = True
            				arr[j], arr[j + 1] = arr[j + 1], arr[j]
            		
            		if not swapped:
            			# if we haven't needed to make a single swap, we
            			# can just exit the main loop.
            			return

            """.trimIndent()
        ).virtualFile
        totalSize += utilsPy.length
        totalLines += utilsPy.toNioPath().toFile().readLines().size

        helperPy = projectRule.fixture.addFileToProject(
            "/helpers/helper.py",
            """
            from helpers import helper as h
            def subtract(num1, num2)
                return num1 - num2
            
            def fib(num):
                if num == 0: return 0
                if num in [1,2]: return 1
                return h.add(fib(num-1), fib(num-2))                

            """.trimIndent()
        ).virtualFile
        totalSize += helperPy.length
        totalLines += helperPy.toNioPath().toFile().readLines().size

        projectRule.fixture.addFileToProject("/notIncluded.md", "### should NOT be included")
    }
}
