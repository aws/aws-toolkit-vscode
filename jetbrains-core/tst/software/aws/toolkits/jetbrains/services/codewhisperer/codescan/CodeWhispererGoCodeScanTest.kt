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
import software.aws.toolkits.jetbrains.services.codewhisperer.codescan.sessionconfig.GoCodeScanSessionConfig
import software.aws.toolkits.jetbrains.utils.rules.PythonCodeInsightTestFixtureRule
import software.aws.toolkits.telemetry.CodewhispererLanguage
import java.io.BufferedInputStream
import java.util.zip.ZipInputStream
import kotlin.io.path.relativeTo
import kotlin.test.assertNotNull

class CodeWhispererGoCodeScanTest : CodeWhispererCodeScanTestBase(PythonCodeInsightTestFixtureRule()) {
    internal lateinit var mainGo: VirtualFile
    internal lateinit var helpGo: VirtualFile
    internal lateinit var numberGo: VirtualFile
    internal lateinit var sessionConfigSpy: GoCodeScanSessionConfig

    private var totalSize: Long = 0
    private var totalLines: Long = 0

    @Before
    override fun setup() {
        super.setup()
        setupGoProject()
        sessionConfigSpy = spy(CodeScanSessionConfig.create(mainGo, project) as GoCodeScanSessionConfig)
        setupResponse(mainGo.toNioPath().relativeTo(sessionConfigSpy.projectRoot.toNioPath()))

        mockClient.stub {
            onGeneric { createUploadUrl(any()) }.thenReturn(fakeCreateUploadUrlResponse)
            onGeneric { createCodeScan(any(), any()) }.thenReturn(fakeCreateCodeScanResponse)
            onGeneric { getCodeScan(any(), any()) }.thenReturn(fakeGetCodeScanResponse)
            onGeneric { listCodeScanFindings(any(), any()) }.thenReturn(fakeListCodeScanFindingsResponse)
        }
    }

    @Test
    fun `test getTotalProjectSizeInBytes()`() {
        getTotalProjectSizeInBytes(sessionConfigSpy, this.totalSize)
    }

    @Test
    fun `test createPayload`() {
        val payload = sessionConfigSpy.createPayload()
        assertNotNull(payload)
        assertThat(payload.context.totalFiles).isEqualTo(3)

        assertThat(payload.context.scannedFiles.size).isEqualTo(3)
        assertThat(payload.context.scannedFiles).containsExactly(mainGo, helpGo, numberGo)

        assertThat(payload.context.srcPayloadSize).isEqualTo(totalSize)
        assertThat(payload.context.language).isEqualTo(CodewhispererLanguage.Go)
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
        getSourceFilesUnderProjectRoot(sessionConfigSpy, mainGo, 3)
    }

    @Test
    fun `test parseImport()`() {
        val mainGoImports = sessionConfigSpy.parseImports(mainGo)
        assertThat(mainGoImports.size).isEqualTo(2)

        val helpGoImports = sessionConfigSpy.parseImports(helpGo)
        assertThat(helpGoImports.size).isEqualTo(1)

        val numberGoImports = sessionConfigSpy.parseImports(numberGo)
        assertThat(numberGoImports.size).isEqualTo(1)
    }

    @Test
    fun `test getImportedFiles()`() {
        val files = sessionConfigSpy.getImportedFiles(mainGo, setOf())
        assertNotNull(files)
        assertThat(files).hasSize(2)
        assertThat(files).contains(helpGo.path)
        assertThat(files).contains(numberGo.path)
    }

    @Test
    fun `test includeDependencies()`() {
        includeDependencies(sessionConfigSpy, 3, totalSize, this.totalLines, 0)
    }

    @Test
    fun `selected file larger than payload limit throws exception`() {
        selectedFileLargerThanPayloadSizeThrowsException(sessionConfigSpy)
    }

    @Test
    fun `test createPayload with custom payload limit`() {
        sessionConfigSpy.stub {
            onGeneric { getPayloadLimitInBytes() }.thenReturn(300)
        }
        val payload = sessionConfigSpy.createPayload()
        assertNotNull(payload)
        assertThat(sessionConfigSpy.isProjectTruncated()).isTrue
        assertThat(payload.context.totalFiles).isEqualTo(2)

        assertThat(payload.context.scannedFiles.size).isEqualTo(2)
        assertThat(payload.context.scannedFiles).containsExactly(mainGo, helpGo)

        assertThat(payload.context.srcPayloadSize).isEqualTo(220)
        assertThat(payload.context.language).isEqualTo(CodewhispererLanguage.Go)
        assertThat(payload.context.totalLines).isEqualTo(17)
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
    fun `test e2e with session run() function`() {
        assertE2ERunsSuccessfully(sessionConfigSpy, projectRule.project, totalLines, 3, totalSize, 2)
    }

    private fun setupGoProject() {
        mainGo = projectRule.fixture.addFileToProject(
            "/main.go",
            """
                package main
                
                import (
                        "example/random-number/util"
                        "fmt"
                )
                
                func main() {
                        fmt.Printf("Number: %d\n", util.RandomNumber())
                }
            """.trimIndent()
        ).virtualFile
        totalSize += mainGo.length
        totalLines += mainGo.toNioPath().toFile().readLines().size

        helpGo = projectRule.fixture.addFileToProject(
            "/help.go",
            """
                package main

                import "fmt"

                func Help() {
                        fmt.Printf("./main")
                }
            """.trimIndent()
        ).virtualFile
        totalSize += helpGo.length
        totalLines += helpGo.toNioPath().toFile().readLines().size

        numberGo = projectRule.fixture.addFileToProject(
            "/util/number.go",
            """
                package util

                import "math/rand"

                func RandomNumber() int {
                        return rand.Intn(100)
                }
            """.trimIndent()
        ).virtualFile
        totalSize += numberGo.length
        totalLines += numberGo.toNioPath().toFile().readLines().size
    }
}
