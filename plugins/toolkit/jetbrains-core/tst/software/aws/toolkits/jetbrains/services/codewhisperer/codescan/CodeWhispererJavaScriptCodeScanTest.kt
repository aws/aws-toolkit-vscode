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
import software.aws.toolkits.jetbrains.services.codewhisperer.util.CodeWhispererConstants
import software.aws.toolkits.jetbrains.utils.rules.PythonCodeInsightTestFixtureRule
import software.aws.toolkits.telemetry.CodewhispererLanguage
import java.io.BufferedInputStream
import java.util.zip.ZipInputStream
import kotlin.io.path.relativeTo
import kotlin.test.assertNotNull

class CodeWhispererJavaScriptCodeScanTest : CodeWhispererCodeScanTestBase(PythonCodeInsightTestFixtureRule()) {

    internal lateinit var testJs: VirtualFile
    internal lateinit var utilsJs: VirtualFile
    internal lateinit var helperJs: VirtualFile
    private lateinit var readMeMd: VirtualFile
    internal lateinit var sessionConfigSpy: CodeScanSessionConfig

    private var totalSize: Long = 0
    private var totalLines: Long = 0

    @Before
    override fun setup() {
        super.setup()
        setupJavaScriptProject()
        sessionConfigSpy = spy(
            CodeScanSessionConfig.create(
                testJs,
                project,
                CodeWhispererConstants.SecurityScanType.PROJECT
            )
        )
        setupResponse(testJs.toNioPath().relativeTo(sessionConfigSpy.projectRoot.toNioPath()))

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
        assertThat(payload.context.scannedFiles).containsExactly(testJs, helperJs, utilsJs, readMeMd)

        assertThat(payload.context.srcPayloadSize).isEqualTo(totalSize)
        assertThat(payload.context.language).isEqualTo(CodewhispererLanguage.Javascript)
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
        getSourceFilesUnderProjectRoot(sessionConfigSpy, testJs, 4)
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
        assertThat(payload.context.scannedFiles).containsExactly(testJs, helperJs)

        assertThat(payload.context.srcPayloadSize).isEqualTo(513)
        assertThat(payload.context.language).isEqualTo(CodewhispererLanguage.Javascript)
        assertThat(payload.context.totalLines).isEqualTo(27)
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

    private fun setupJavaScriptProject() {
        testJs = projectRule.fixture.addFileToProject(
            "/test.js",
            """
            import * as utils from "./utils";
            import * from 'nodeJs';
            var myVar = require('./helpers/helper.js'); 
            
            var a = 1;
            var b = 2;
            
            var c = utils.add(a, b);
            var d = myVar.subtract(a, b);
            var e = utils.fib(a, b);
            """.trimIndent()
        ).virtualFile
        totalSize += testJs.length
        totalLines += testJs.toNioPath().toFile().readLines().size

        utilsJs = projectRule.fixture.addFileToProject(
            "/utils.js",
            """
            function add(num1, num2) {
              return num1 + num2;
            }
            
            function bblSort(arr) {
                for(var i = 0; i < arr.length; i++) {
                    // Last i elements are already in place
                    for(var j = 0; j < ( arr.length - i -1 ); j++) {
                        // Checking if the item at present iteration
                        // is greater than the next iteration
                        if(arr[j] > arr[j+1]) {
                            // If the condition is true then swap them
                            var temp = arr[j]
                            arr[j] = arr[j + 1]
                            arr[j+1] = temp
                        }
                    }
                }
                // Print the sorted array
                console.log(arr);
            }
            """.trimIndent()
        ).virtualFile
        totalSize += utilsJs.length
        totalLines += utilsJs.toNioPath().toFile().readLines().size

        helperJs = projectRule.fixture.addFileToProject(
            "/helpers/helper.js",
            """
            import * as h from './helpers/helper.js'
            function subtract(num1, num2) {
              return num1 - num2;
            }
            
            function fibonacci(num) {
                var num1=0;
                var num2=1;
                var sum;
                var i=0;
                for (i = 0; i < num; i++) {
                    sum=h.add(num1, num2);
                    num1=num2;
                    num2=sum;
                }
                return num2;
            }

            """.trimIndent()
        ).virtualFile
        totalSize += helperJs.length
        totalLines += helperJs.toNioPath().toFile().readLines().size

        readMeMd = projectRule.fixture.addFileToProject("/ReadMe.md", "### Now included").virtualFile
        totalSize += readMeMd.length
        totalLines += readMeMd.toNioPath().toFile().readLines().size
    }
}
