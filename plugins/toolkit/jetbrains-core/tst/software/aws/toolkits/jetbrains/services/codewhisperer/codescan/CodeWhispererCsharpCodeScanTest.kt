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
    private lateinit var readMeMd: VirtualFile
    private lateinit var sessionConfigSpy: CodeScanSessionConfig
    private lateinit var sessionConfigSpy2: CodeScanSessionConfig

    private var totalSize: Long = 0
    private var totalLines: Long = 0

    @Before
    override fun setup() {
        super.setup()
        setupCsharpProject()
        sessionConfigSpy = spy(CodeScanSessionConfig.create(testCs, project, CodeWhispererConstants.SecurityScanType.PROJECT))
        setupResponse(testCs.toNioPath().relativeTo(sessionConfigSpy.projectRoot.toNioPath()))

        sessionConfigSpy2 = spy(CodeScanSessionConfig.create(testCs, project, CodeWhispererConstants.SecurityScanType.FILE))
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
        assertThat(payload.context.totalFiles).isEqualTo(4)

        assertThat(payload.context.scannedFiles.size).isEqualTo(4)
        assertThat(payload.context.scannedFiles).containsExactly(testCs, helperCs, utilsCs, readMeMd)

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

        assertThat(filesInZip).isEqualTo(4)
    }

    @Test
    fun `test getSourceFilesUnderProjectRoot`() {
        getSourceFilesUnderProjectRoot(sessionConfigSpy, testCs, 4)
    }

    @Test
    fun `test getSourceFilesUnderProjectRootForFileScan`() {
        getSourceFilesUnderProjectRootForFileScan(sessionConfigSpy2, testCs)
    }

    @Test
    fun `test includeDependencies()`() {
        includeDependencies(sessionConfigSpy, 4, totalSize, this.totalLines, 0)
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
        assertThat(payload.context.scannedFiles).containsExactly(testCs, helperCs)

        // Adding 16 Bytes for read me Markdown file across all tests.
        assertThat(payload.context.srcPayloadSize).isEqualTo(887)
        assertThat(payload.context.language).isEqualTo(CodewhispererLanguage.Csharp)
        assertThat(payload.context.totalLines).isEqualTo(44)
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
        assertE2ERunsSuccessfully(sessionConfigSpy, project, totalLines, 4, totalSize, 2)
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

        readMeMd = projectRule.fixture.addFileToProject("/ReadMe.md", "### Now included").virtualFile
        totalSize += readMeMd.length
        totalLines += readMeMd.toNioPath().toFile().readLines().size

        // Adding gitignore file and gitignore file member for testing.
        // The tests include the markdown file but not these two files.
        projectRule.fixture.addFileToProject("/.gitignore", "node_modules\n.idea\n.vscode\n.DS_Store").virtualFile
        projectRule.fixture.addFileToProject("test.idea", "ref: refs/heads/main")
    }
}
