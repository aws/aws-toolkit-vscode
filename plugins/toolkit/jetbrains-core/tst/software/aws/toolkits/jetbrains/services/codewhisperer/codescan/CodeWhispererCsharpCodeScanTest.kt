// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
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
import software.aws.toolkits.jetbrains.services.codewhisperer.codescan.sessionconfig.CsharpCodeScanSessionConfig
import software.aws.toolkits.jetbrains.services.codewhisperer.util.CodeWhispererConstants
import software.aws.toolkits.jetbrains.utils.rules.PythonCodeInsightTestFixtureRule
import software.aws.toolkits.telemetry.CodewhispererLanguage
import java.io.BufferedInputStream
import java.util.zip.ZipInputStream
import kotlin.io.path.relativeTo
import kotlin.test.assertNotNull

class CodeWhispererCsharpCodeScanTest : CodeWhispererCodeScanTestBase(PythonCodeInsightTestFixtureRule()) {
    private lateinit var testCs: VirtualFile
    private lateinit var utilsCs: VirtualFile
    private lateinit var helperCs: VirtualFile
    private lateinit var sessionConfigSpy: CsharpCodeScanSessionConfig
    private lateinit var sessionConfigSpy2: CsharpCodeScanSessionConfig

    private var totalSize: Long = 0
    private var totalLines: Long = 0

    @Before
    override fun setup() {
        super.setup()
        setupCsharpProject()
        sessionConfigSpy = spy(CodeScanSessionConfig.create(testCs, project, CodeWhispererConstants.SecurityScanType.PROJECT) as CsharpCodeScanSessionConfig)
        setupResponse(testCs.toNioPath().relativeTo(sessionConfigSpy.projectRoot.toNioPath()))

        sessionConfigSpy2 = spy(CodeScanSessionConfig.create(testCs, project, CodeWhispererConstants.SecurityScanType.FILE) as CsharpCodeScanSessionConfig)
        setupResponse(testCs.toNioPath().relativeTo(sessionConfigSpy2.projectRoot.toNioPath()))

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
        assertThat(payload.context.scannedFiles).containsExactly(testCs, utilsCs, helperCs)

        assertThat(payload.context.srcPayloadSize).isEqualTo(totalSize)
        assertThat(payload.context.language).isEqualTo(CodewhispererLanguage.Csharp)
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
        getSourceFilesUnderProjectRoot(sessionConfigSpy, testCs, 3)
    }

    @Test
    fun `test getSourceFilesUnderProjectRootForFileScan`() {
        getSourceFilesUnderProjectRootForFileScan(sessionConfigSpy2, testCs)
    }

    @Test
    fun `test parseImport()`() {
        val testCsImports = sessionConfigSpy.parseImports(testCs)
        assertThat(testCsImports.size).isEqualTo(3)

        val helperCsImports = sessionConfigSpy.parseImports(helperCs)
        assertThat(helperCsImports.size).isEqualTo(0)

        val utilsCsImports = sessionConfigSpy.parseImports(utilsCs)
        assertThat(utilsCsImports.size).isEqualTo(0)
    }

    @Test
    fun `test getImportedFiles()`() {
        val files = sessionConfigSpy.getImportedFiles(testCs, setOf())
        assertNotNull(files)
        assertThat(files).hasSize(2)
        assertThat(files).contains(utilsCs.path)
        assertThat(files).contains(helperCs.path)
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
        assertThat(payload.context.scannedFiles).containsExactly(testCs, utilsCs)

        assertThat(payload.context.srcPayloadSize).isEqualTo(431)
        assertThat(payload.context.language).isEqualTo(CodewhispererLanguage.Csharp)
        assertThat(payload.context.totalLines).isEqualTo(26)
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
    fun `e2e happy path integration test`() {
        assertE2ERunsSuccessfully(sessionConfigSpy, project, totalLines, 3, totalSize, 2)
    }

    private fun setupCsharpProject() {
        testCs = projectRule.fixture.addFileToProject(
            "/Test.cs",
            """
            using Utils;
            using Helpers.Helper;
            
            int a = 1;
            int b = 2;
            
            int c = Utils.Add(a, b);
            int d = Helper.Subtract(a, b);
            int e = Utils.Fib(5);
            """.trimIndent()
        ).virtualFile
        totalSize += testCs.length
        totalLines += testCs.toNioPath().toFile().readLines().size

        utilsCs = projectRule.fixture.addFileToProject(
            "/Utils.cs",
            """
            public static class Utils
            {
                public static int Add(int a, int b)
                {
                    return a + b;
                }
            
                public static int Fib(int n)
                {
                    if (n <= 0) return 0;
                    if (n == 1 || n == 2)
                    {
                        return 1;
                    }
                    return Add(Fib(n - 1), Fib(n - 2));
                }
            }
            """.trimIndent()
        ).virtualFile
        totalSize += utilsCs.length
        totalLines += utilsCs.toNioPath().toFile().readLines().size

        helperCs = projectRule.fixture.addFileToProject(
            "/Helpers/Helper.cs",
            """
            public static class Helper
            {
                public static int Subtract(int a, int b)
                {
                    return a - b;
                }
                public static int Muliply(int a, int b)
                {
                    return a * b;
                }
                public static int Divide(int a, int b)
                {
                    return a / b;
                }
                 public static void BblSort(int[] arr)
                {
                    int n = arr.Length;
            
                    for (int i = 0; i < n - 1; i++)
                    {
                        for (int j = 0; j < n - i - 1; j++)
                        {
                            if (arr[j] > arr[j + 1])
                            {
                                // Swap arr[j] and arr[j + 1]
                                int temp = arr[j];
                                arr[j] = arr[j + 1];
                                arr[j + 1] = temp;
                            }
                        }
                    }
            
                    return arr;
                }
            }
            """.trimIndent()
        ).virtualFile
        totalSize += helperCs.length
        totalLines += helperCs.toNioPath().toFile().readLines().size

        projectRule.fixture.addFileToProject("/notIncluded.md", "### should NOT be included")
    }
}
