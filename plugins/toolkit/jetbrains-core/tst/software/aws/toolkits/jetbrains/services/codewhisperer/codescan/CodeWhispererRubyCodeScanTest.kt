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

class CodeWhispererRubyCodeScanTest : CodeWhispererCodeScanTestBase(PythonCodeInsightTestFixtureRule()) {
    private lateinit var testRuby: VirtualFile
    private lateinit var utilsRuby: VirtualFile
    private lateinit var helperRuby: VirtualFile
    private lateinit var sampleRuby: VirtualFile
    private lateinit var readMeMd: VirtualFile
    private lateinit var sessionConfigSpy: CodeScanSessionConfig

    private var totalSize: Long = 0
    private var totalLines: Long = 0

    @Before
    override fun setup() {
        super.setup()
        setupRubyProject()
        sessionConfigSpy = spy(CodeScanSessionConfig.create(testRuby, project, CodeWhispererConstants.CodeAnalysisScope.PROJECT))
        setupResponse(testRuby.toNioPath().relativeTo(sessionConfigSpy.projectRoot.toNioPath()))

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
        assertThat(payload.context.totalFiles).isEqualTo(5)

        assertThat(payload.context.scannedFiles.size).isEqualTo(5)
        assertThat(payload.context.scannedFiles).containsExactly(testRuby, helperRuby, utilsRuby, readMeMd, sampleRuby)

        assertThat(payload.context.srcPayloadSize).isEqualTo(totalSize)
        assertThat(payload.context.language).isEqualTo(CodewhispererLanguage.Ruby)
        assertThat(payload.context.totalLines).isEqualTo(totalLines)
        assertNotNull(payload.srcZip)

        val bufferedInputStream = BufferedInputStream(payload.srcZip.inputStream())
        val zis = ZipInputStream(bufferedInputStream)
        var filesInZip = 0
        while (zis.nextEntry != null) {
            filesInZip += 1
        }

        assertThat(filesInZip).isEqualTo(5)
    }

    @Test
    fun `test getSourceFilesUnderProjectRoot`() {
        getSourceFilesUnderProjectRoot(sessionConfigSpy, testRuby, 5)
    }

    @Test
    fun `test includeDependencies()`() {
        includeDependencies(sessionConfigSpy, 5, totalSize, this.totalLines, 0)
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

        assertThat(payload.context.totalFiles).isEqualTo(4)

        assertThat(payload.context.scannedFiles.size).isEqualTo(4)
        assertThat(payload.context.scannedFiles).containsExactly(testRuby, helperRuby, utilsRuby, readMeMd)

        assertThat(payload.context.srcPayloadSize).isEqualTo(806)
        assertThat(payload.context.language).isEqualTo(CodewhispererLanguage.Ruby)
        assertThat(payload.context.totalLines).isEqualTo(50)
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
    fun `test e2e with session run() function`() {
        assertE2ERunsSuccessfully(sessionConfigSpy, project, totalLines, 5, totalSize, 2)
    }

    private fun setupRubyProject() {
        testRuby = projectRule.fixture.addFileToProject(
            "/test.rb",
            """
                require 'utils'
                require_relative 'helpers/helper'
                
                a = 1
                b = 2
                
                c = Utils.add(a, b)
                d = Helper.subtract(a, b)
                e = Utils.fib(5)
            """.trimIndent()
        ).virtualFile
        totalSize += testRuby.length
        totalLines += testRuby.toNioPath().toFile().readLines().size

        utilsRuby = projectRule.fixture.addFileToProject(
            "/utils.rb",
            """
                module Utils
                    def self.add(a, b)
                    a + b
                    end
                
                    def self.fib(n)
                    return n if n <= 1
                    
                    fib(n - 1) + fib(n - 2)
                    end
                end
            """.trimIndent()
        ).virtualFile
        totalSize += utilsRuby.length
        totalLines += utilsRuby.toNioPath().toFile().readLines().size

        sampleRuby = projectRule.fixture.addFileToProject(
            "/sample.rb",
            """
                include Math
                module Sample
                    def tower_of_hanoi(n, source, auxiliary, target)
                        if n > 0
                        # Move n - 1 disks from source to auxiliary peg
                        tower_of_hanoi(n - 1, source, target, auxiliary)
                        
                        # Move the nth disk from source to target peg
                        puts "Move disk #{n} from #{source} to #{target}"
                        
                        # Move the n - 1 disks from auxiliary to target peg
                        tower_of_hanoi(n - 1, auxiliary, source, target)
                        end
                    end
                    def max_of_two_numbers(num1, num2)
                        result = Math.max(num1, num2)
                        return result
                    end
                end
            """.trimIndent()
        ).virtualFile
        totalSize += sampleRuby.length
        totalLines += sampleRuby.toNioPath().toFile().readLines().size

        helperRuby = projectRule.fixture.addFileToProject(
            "/helpers/helper.rb",
            """
                load 'Sample.rb'
                module Helper
                    def self.subtract(a, b)
                    a - b
                    end
                  
                    def self.multiply(a, b)
                      a * b
                    end
                    
                    def self.divide(a, b)
                      a / b
                    end
                    
                    def self.bubble_sort(arr)
                        n = arr.length
                        
                        (0...n - 1).each do |i|
                          (0...n - i - 1).each do |j|
                            if arr[j] > arr[j + 1]
                              # Swap arr[j] and arr[j + 1]
                              arr[j], arr[j + 1] = arr[j + 1], arr[j]
                            end
                          end
                        end
                        
                        arr
                    end
                end
            """.trimIndent()
        ).virtualFile
        totalSize += helperRuby.length
        totalLines += helperRuby.toNioPath().toFile().readLines().size

        readMeMd = projectRule.fixture.addFileToProject("/ReadMe.md", "### Now included").virtualFile
        totalSize += readMeMd.length
        totalLines += readMeMd.toNioPath().toFile().readLines().size
    }
}
