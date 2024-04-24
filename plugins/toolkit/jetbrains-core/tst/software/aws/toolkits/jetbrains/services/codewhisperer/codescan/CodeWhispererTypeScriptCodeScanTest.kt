// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.codescan

import com.intellij.openapi.vfs.VirtualFile
import org.assertj.core.api.Assertions.assertThat
import org.junit.Before
import org.junit.Test
import org.junit.jupiter.api.assertThrows
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

class CodeWhispererTypeScriptCodeScanTest : CodeWhispererCodeScanTestBase(PythonCodeInsightTestFixtureRule()) {

    internal lateinit var testTs: VirtualFile
    internal lateinit var utilsTs: VirtualFile
    internal lateinit var helperTs: VirtualFile
    private lateinit var readMeMd: VirtualFile
    internal lateinit var sessionConfigSpy: CodeScanSessionConfig

    private var totalSize: Long = 0
    private var totalLines: Long = 0

    @Before
    override fun setup() {
        super.setup()
        setupTypeScriptProject()
        sessionConfigSpy = spy(
            CodeScanSessionConfig.create(
                testTs,
                project,
                CodeWhispererConstants.SecurityScanType.PROJECT
            )
        )
        setupResponse(testTs.toNioPath().relativeTo(sessionConfigSpy.projectRoot.toNioPath()))

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
        assertThat(payload.context.scannedFiles).containsExactly(testTs, helperTs, utilsTs, readMeMd)

        assertThat(payload.context.srcPayloadSize).isEqualTo(totalSize)
        assertThat(payload.context.language).isEqualTo(CodewhispererLanguage.Typescript)
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
        assertThat(
            sessionConfigSpy.getSourceFilesUnderProjectRoot(
                testTs,
                CodeWhispererConstants.SecurityScanType.PROJECT
            ).size
        ).isEqualTo(4)
    }

    @Test
    fun `test includeDependencies()`() {
        val payloadMetadata = sessionConfigSpy.includeDependencies()
        assertNotNull(payloadMetadata)
        assertThat(sessionConfigSpy.isProjectTruncated()).isFalse
        assertThat(payloadMetadata.sourceFiles.size).isEqualTo(4)
        assertThat(payloadMetadata.payloadSize).isEqualTo(totalSize)
        assertThat(payloadMetadata.linesScanned).isEqualTo(this.totalLines)
        assertThat(payloadMetadata.buildPaths).hasSize(0)
    }

    @Test
    fun `selected file larger than payload limit throws exception`() {
        sessionConfigSpy.stub {
            onGeneric { getPayloadLimitInBytes() }.thenReturn(100)
        }
        assertThrows<CodeWhispererCodeScanException> {
            sessionConfigSpy.createPayload()
        }
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
        assertThat(payload.context.scannedFiles).containsExactly(testTs, helperTs)

        assertThat(payload.context.srcPayloadSize).isEqualTo(636L)
        assertThat(payload.context.language).isEqualTo(CodewhispererLanguage.Typescript)
        assertThat(payload.context.totalLines).isEqualTo(24)
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
        assertE2ERunsSuccessfully(sessionConfigSpy, projectRule.project, totalLines, 4, totalSize, 2)
    }

    private fun setupTypeScriptProject() {
        testTs = projectRule.fixture.addFileToProject(
            "/test.ts",
            """
            import * as utils from "./utils";
            import * as nodeJs from 'nodeJs';
            var a = 1;
            var b = 2;
            
            var c = utils.add(a, b);
            var d = myVar.subtract(a, b);
            var e = utils.bblSort(a, b);
            """.trimIndent()
        ).virtualFile
        totalSize += testTs.length
        totalLines += testTs.toNioPath().toFile().readLines().size

        utilsTs = projectRule.fixture.addFileToProject(
            "/utils.ts",
            """
            import * as nodeJs from 'nodeJs';
            function add(num1: number, num2: number): number {
               return num1 + num2;
            }
            
            function bblSort(arr: number[]): void {
               for(let i: number = 0; i < arr.length; i++) {
                   for(let j: number = 0; j < ( arr.length - i -1 ); j++) {
                       if(arr[j] > arr[j+1]) {
                           let temp: number = arr[j];
                           arr[j] = arr[j + 1];
                           arr[j+1] = temp;
                       }
                   }
               }
               console.log(arr);
            }
            """.trimIndent()
        ).virtualFile
        totalSize += utilsTs.length
        totalLines += utilsTs.toNioPath().toFile().readLines().size

        helperTs = projectRule.fixture.addFileToProject(
            "/helpers/helper.ts",
            """
            import * as utils from "./utils";
            function subtract(num1: number, num2: number): number {
               return num1 - num2;
            }
            function bblSort(arr: number[]): void {
               for(let i: number = 0; i < arr.length; i++) {
                   for(let j: number = 0; j < ( arr.length - i -1 ); j++) {
                       if(arr[j] > arr[j+1]) {
                           let temp: number = arr[j];
                           arr[j] = arr[j + 1];
                           arr[j+1] = temp;
                       }
                   }
               }
               console.log(arr);
            }
            """.trimIndent()
        ).virtualFile
        totalSize += helperTs.length
        totalLines += helperTs.toNioPath().toFile().readLines().size

        readMeMd = projectRule.fixture.addFileToProject("/ReadMe.md", "### Now included").virtualFile
        totalSize += readMeMd.length
        totalLines += readMeMd.toNioPath().toFile().readLines().size
    }
}
