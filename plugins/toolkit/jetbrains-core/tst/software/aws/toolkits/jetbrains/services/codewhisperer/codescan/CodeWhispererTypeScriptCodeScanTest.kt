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
import software.aws.toolkits.jetbrains.services.codewhisperer.codescan.sessionconfig.JavaScriptCodeScanSessionConfig
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
    internal lateinit var sessionConfigSpy: JavaScriptCodeScanSessionConfig

    private var totalSize: Long = 0
    private var totalLines: Long = 0

    @Before
    override fun setup() {
        super.setup()
        setupTypeScriptProject()
        sessionConfigSpy = spy(CodeScanSessionConfig.create(testTs, project) as JavaScriptCodeScanSessionConfig)
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
        assertThat(payload.context.totalFiles).isEqualTo(3)

        assertThat(payload.context.scannedFiles.size).isEqualTo(3)
        assertThat(payload.context.scannedFiles).containsExactly(testTs, utilsTs, helperTs)

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

        assertThat(filesInZip).isEqualTo(3)
    }

    @Test
    fun `test getSourceFilesUnderProjectRoot`() {
        assertThat(sessionConfigSpy.getSourceFilesUnderProjectRoot(testTs).size).isEqualTo(3)
    }

    @Test
    fun `test parseImport()`() {
        val testTsImports = sessionConfigSpy.parseImports(testTs)
        assertThat(testTsImports.size).isEqualTo(2)

        val helperTsImports = sessionConfigSpy.parseImports(helperTs)
        assertThat(helperTsImports.size).isEqualTo(1)

        val utilsTsImports = sessionConfigSpy.parseImports(utilsTs)
        assertThat(utilsTsImports.size).isEqualTo(1)
    }

    @Test
    fun `test getImportedFiles()`() {
        val files = sessionConfigSpy.getImportedFiles(testTs, setOf())
        assertNotNull(files)
        assertThat(files).hasSize(1)
        assertThat(files).contains(utilsTs.path)
    }

    @Test
    fun `test includeDependencies()`() {
        val payloadMetadata = sessionConfigSpy.includeDependencies()
        assertNotNull(payloadMetadata)
        assertThat(sessionConfigSpy.isProjectTruncated()).isFalse
        assertThat(payloadMetadata.sourceFiles.size).isEqualTo(3)
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
        assertThat(payload.context.scannedFiles).containsExactly(testTs, utilsTs)

        assertThat(payload.context.srcPayloadSize).isEqualTo(632L)
        assertThat(payload.context.language).isEqualTo(CodewhispererLanguage.Typescript)
        assertThat(payload.context.totalLines).isEqualTo(25)
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
        assertE2ERunsSuccessfully(sessionConfigSpy, projectRule.project, totalLines, 3, totalSize, 2)
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

        projectRule.fixture.addFileToProject("/notIncluded.md", "### should NOT be included")
    }
}
