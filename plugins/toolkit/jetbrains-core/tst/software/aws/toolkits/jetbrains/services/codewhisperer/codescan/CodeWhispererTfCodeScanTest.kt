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

class CodeWhispererTfCodeScanTest : CodeWhispererCodeScanTestBase(PythonCodeInsightTestFixtureRule()) {

    private lateinit var testTf: VirtualFile
    private lateinit var test2Tf: VirtualFile
    private lateinit var test3Tf: VirtualFile
    private lateinit var readMeMd: VirtualFile
    private lateinit var sessionConfigSpy: CodeScanSessionConfig

    private var totalSize: Long = 0
    private var totalLines: Long = 0

    @Before
    override fun setup() {
        super.setup()
        setupTfProject()
        sessionConfigSpy = spy(CodeScanSessionConfig.create(testTf, project, CodeWhispererConstants.CodeAnalysisScope.PROJECT))
        setupResponse(testTf.toNioPath().relativeTo(sessionConfigSpy.projectRoot.toNioPath()))

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
        assertThat(payload.context.scannedFiles).containsExactly(testTf, test3Tf, readMeMd, test2Tf)

        assertThat(payload.context.srcPayloadSize).isEqualTo(totalSize)
        assertThat(payload.context.language).isEqualTo(CodewhispererLanguage.Tf)
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
        getSourceFilesUnderProjectRoot(sessionConfigSpy, testTf, 4)
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
        assertThat(payload.context.totalFiles).isEqualTo(1)

        assertThat(payload.context.scannedFiles.size).isEqualTo(1)
        assertThat(payload.context.scannedFiles).containsExactly(testTf)

        assertThat(payload.context.srcPayloadSize).isEqualTo(334)
        assertThat(payload.context.language).isEqualTo(CodewhispererLanguage.Tf)
        assertThat(payload.context.totalLines).isEqualTo(11)
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
        assertE2ERunsSuccessfully(sessionConfigSpy, projectRule.project, totalLines, 4, totalSize, 2)
    }

    private fun setupTfProject() {
        testTf = projectRule.fixture.addFileToProject(
            "/testTf.tf",
            """
                # Create example resource for three S3 buckets using for_each, where the bucket prefix are in variable with list containing [prod, staging, dev]
                
                resource "aws_s3_bucket" "example" {
                  for_each      = toset(var.names)
                  bucket_prefix = each.value
                }
                
                variable "names" {
                  type    = list(string)
                  default = ["prod", "staging", "dev"]
                }
            """.trimIndent()
        ).virtualFile
        totalSize += testTf.length
        totalLines += testTf.toNioPath().toFile().readLines().size

        test2Tf = projectRule.fixture.addFileToProject(
            "/test2Tf.tf",
            """
                # Terraform code to create an ec2 route with a network interface via the 'aws' provider
                
                resource "aws_route" "example" {
                    route_table_id = aws_route_table.example.id
                    destination_cidr_block = "100.0.0.0/16"
                    network_interface_id = aws_network_interface.example.id
                
                    depends_on = [aws_network_interface.example, aws_route_table.example]
                }
                
                # Create a VPC
                resource "aws_vpc" "example" {
                    cidr_block = "10.0.0.0/16"
                    enable_dns_support = true
                    enable_dns_hostnames = true 
                    tags = {
                        Name = "MainVPC"
                    }
                }
                
                # Create a Public Subnet
                resource "aws_subnet" "example" {
                    vpc_id = aws_vpc.example.id
                    cidr_block = "10.0.1.0/24"
                    tags = {
                        Name = "PublicSubnet"
                    }
                    depends_on = [aws_vpc.example]
                }
                
                # Creata a Route Table
                resource "aws_route_table" "example" {
                    vpc_id = aws_vpc.example.id
                    tags = {
                        Name = "PublicRouteTable"
                    }
                }
                
                # Create a Network Interface 
                resource "aws_network_interface" "example" {
                  subnet_id = aws_subnet.example.id
                  description  = "Network interface example"
                
                }
            """.trimIndent()
        ).virtualFile
        totalSize += test2Tf.length
        totalLines += test2Tf.toNioPath().toFile().readLines().size

        test3Tf = projectRule.fixture.addFileToProject(
            "/helpers/test3Tf.tf",
            """
                # Terraform code to create an EC2 route with internet gateway via the 'aws' provider
                
                resource "aws_route" "example" {
                    route_table_id = aws_route_table.example.id
                    destination_cidr_block = "100.0.0.0/16"
                    gateway_id = aws_internet_gateway.example.id
                
                    depends_on = [aws_internet_gateway.example]
                }
                
                # Create a VPC
                resource "aws_vpc" "example" {
                    cidr_block = "10.0.0.0/16"
                    enable_dns_support = true
                    enable_dns_hostnames = true 
                    tags = {
                        Name = "MainVPC"
                    }
                }
                
                # Create a Public Subnet 
                resource "aws_subnet" "example" {
                    vpc_id = aws_vpc.example.id
                    cidr_block = "10.0.1.0/24"
                    tags = {
                        Name = "PublicSubnet"
                    }
                    depends_on = [aws_vpc.example]
                }
                
                # Create a Route Table
                resource "aws_route_table" "example" {
                    vpc_id = aws_vpc.example.id
                    tags = {
                        Name = "PublicRouteTable"
                    }
                }
                
                # Create a Internet Gateway
                resource "aws_internet_gateway" "example" {
                    vpc_id = aws_vpc.example.id
                    
                    depends_on = [aws_vpc.example]
                }
            """.trimIndent()
        ).virtualFile
        totalSize += test3Tf.length
        totalLines += test3Tf.toNioPath().toFile().readLines().size

        readMeMd = projectRule.fixture.addFileToProject("/ReadMe.md", "### Now included").virtualFile
        totalSize += readMeMd.length
        totalLines += readMeMd.toNioPath().toFile().readLines().size
    }
}
