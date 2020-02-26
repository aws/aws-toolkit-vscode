// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.schemas.code

import com.intellij.notification.Notification
import com.intellij.notification.Notifications
import com.intellij.openapi.progress.ProgressIndicator
import com.intellij.testFramework.ProjectRule
import com.intellij.util.io.Compressor
import com.nhaarman.mockitokotlin2.any
import com.nhaarman.mockitokotlin2.eq
import com.nhaarman.mockitokotlin2.mock
import com.nhaarman.mockitokotlin2.stub
import com.nhaarman.mockitokotlin2.times
import com.nhaarman.mockitokotlin2.verify
import org.apache.commons.lang.exception.ExceptionUtils
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.assertj.core.api.Assertions.catchThrowable
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import software.amazon.awssdk.core.SdkBytes
import software.amazon.awssdk.services.schemas.SchemasClient
import software.amazon.awssdk.services.schemas.model.CodeGenerationStatus
import software.amazon.awssdk.services.schemas.model.DescribeCodeBindingRequest
import software.amazon.awssdk.services.schemas.model.DescribeCodeBindingResponse
import software.amazon.awssdk.services.schemas.model.GetCodeBindingSourceRequest
import software.amazon.awssdk.services.schemas.model.GetCodeBindingSourceResponse
import software.amazon.awssdk.services.schemas.model.InternalServerErrorException
import software.amazon.awssdk.services.schemas.model.NotFoundException
import software.amazon.awssdk.services.schemas.model.PutCodeBindingRequest
import software.amazon.awssdk.services.schemas.model.PutCodeBindingResponse
import software.aws.toolkits.core.utils.WaiterTimeoutException
import software.aws.toolkits.core.utils.failedFuture
import software.aws.toolkits.jetbrains.core.MockClientManagerRule
import software.aws.toolkits.jetbrains.services.schemas.SchemaCodeLangs
import software.aws.toolkits.jetbrains.services.schemas.SchemaSummary
import java.io.File
import java.io.FileOutputStream
import java.nio.ByteBuffer
import java.nio.file.Files
import java.nio.file.Paths
import java.time.Duration
import java.util.concurrent.CompletableFuture.completedFuture

class SchemaCodeDownloaderTest {

    @Rule
    @JvmField
    val projectRule = ProjectRule()

    @Rule
    @JvmField
    val tempFolder = TemporaryFolder()

    private lateinit var SOURCE_FOLDER_FILE: File
    private lateinit var ZIP_FILE: File
    private lateinit var DESTINATION_FOLDER_FILE: File

    private lateinit var SOURCE_FOLDER: String
    private lateinit var ZIP_FILE_PATH: String
    private lateinit var DESTINATION_FOLDER: String

    private val ZIP_FOLDER_HIERARCHY = "srcDir/comDir/fooBarDir/"
    private val ZIP_FILE_1 = "File1.java"
    private val ZIP_FILE_2 = "File2.java"
    private val SOME_TEXT = "someText"

    @JvmField
    @Rule
    val mockClientManager = MockClientManagerRule(projectRule)

    private var errorNotification: Notification? = null

    private val REGISTRY = "registry"
    private val SCHEMA = "schema"
    private val FAKE_DESTINATION = "/some/destination/anything/really"
    private val SCHEMA_SUMMARY = SchemaSummary(SCHEMA, REGISTRY)
    private val VERSION = "2"
    private val LANGUAGE = SchemaCodeLangs.JAVA8
    private val REQUEST = SchemaCodeDownloadRequestDetails(SCHEMA_SUMMARY, VERSION, LANGUAGE, FAKE_DESTINATION)
    private val ZIP_FILE_SCHEMA_CORE_CODE_FILE_NAME = REQUEST.schemaCoreCodeFileName()

    private val mockSchemasClient = mock<SchemasClient>()
    private val codeGenerator = mock<CodeGenerator>()
    private val codePoller = mock<CodeGenerationStatusPoller>()
    private val codeDownloader = mock<CodeDownloader>()
    private val codeExtractor = mock<CodeExtractor>()
    private val progressUpdater = mock<ProgressUpdater>()
    private val progressIndicator = mock<ProgressIndicator>()
    private val downloadedSchemaCode = mock<DownloadedSchemaCode>()
    private val schemaCodeCoreFile = mock<File>()

    @Before
    fun setUp() {
        subscribeToNotifications()
    }

    @Test
    fun canGenerateCode() {
        val putCodeBindingRequest = PutCodeBindingRequest.builder()
            .schemaName(SCHEMA)
            .registryName(REGISTRY)
            .language(LANGUAGE.apiValue)
            .schemaVersion(VERSION)
            .build()

        val putCodeBindingResponse = PutCodeBindingResponse.builder()
            .status(CodeGenerationStatus.CREATE_IN_PROGRESS)
            .schemaVersion(VERSION)
            .build()

        mockSchemasClient.stub {
            on { putCodeBinding(putCodeBindingRequest) }.thenReturn(putCodeBindingResponse)
        }

        val codeGenerationStatus = CodeGenerator(mockSchemasClient).generate(REQUEST).toCompletableFuture().get()

        verify(mockSchemasClient).putCodeBinding(putCodeBindingRequest)
        assertThat(codeGenerationStatus).isEqualTo(CodeGenerationStatus.CREATE_IN_PROGRESS)
    }

    @Test
    fun canGetCurrentCodeGenerationStatus() {
        val describeCodeBindingRequest = DescribeCodeBindingRequest.builder()
            .schemaName(SCHEMA)
            .registryName(REGISTRY)
            .language(LANGUAGE.apiValue)
            .schemaVersion(VERSION)
            .build()

        val expectedCodeGenerationStatus = CodeGenerationStatus.CREATE_IN_PROGRESS
        val describeCodeBindingResponse = DescribeCodeBindingResponse.builder()
            .status(expectedCodeGenerationStatus)
            .schemaVersion(VERSION)
            .build()

        mockSchemasClient.stub {
            on { mockSchemasClient.describeCodeBinding(describeCodeBindingRequest) }.thenReturn(describeCodeBindingResponse)
        }

        val actualCodeGenerationStatus = CodeGenerationStatusPoller(mockSchemasClient).getCurrentStatus(REQUEST).toCompletableFuture().get()

        verify(mockSchemasClient).describeCodeBinding(describeCodeBindingRequest)
        assertThat(actualCodeGenerationStatus).isEqualTo(expectedCodeGenerationStatus)
    }

    @Test
    fun canPollForCurrentCodeGenerationStatus() {
        val describeCodeBindingRequest = DescribeCodeBindingRequest.builder()
            .schemaName(SCHEMA)
            .registryName(REGISTRY)
            .language(LANGUAGE.apiValue)
            .schemaVersion(VERSION)
            .build()

        val inProgressResponse = DescribeCodeBindingResponse.builder()
            .status(CodeGenerationStatus.CREATE_IN_PROGRESS)
            .schemaVersion(VERSION)
            .build()
        val completedResponse = DescribeCodeBindingResponse.builder()
            .status(CodeGenerationStatus.CREATE_COMPLETE)
            .schemaVersion(VERSION)
            .build()

        mockSchemasClient.stub {
            on { describeCodeBinding(describeCodeBindingRequest) }.thenReturn(inProgressResponse)
                .thenReturn(inProgressResponse)
                .thenReturn(inProgressResponse)
                .thenReturn(completedResponse)
        }

        val createdSchemaName = CodeGenerationStatusPoller(mockSchemasClient).pollForCompletion(REQUEST).toCompletableFuture().get()

        verify(mockSchemasClient, times(4)).describeCodeBinding(describeCodeBindingRequest)
        assertThat(createdSchemaName).isEqualTo(SCHEMA)
    }

    @Test
    fun pollForCurrentCodeGenerationStatusMaxAttempts() {
        val describeCodeBindingRequest = DescribeCodeBindingRequest.builder()
            .schemaName(SCHEMA)
            .registryName(REGISTRY)
            .language(LANGUAGE.apiValue)
            .schemaVersion(VERSION)
            .build()

        val inProgressResponse = DescribeCodeBindingResponse.builder()
            .status(CodeGenerationStatus.CREATE_IN_PROGRESS)
            .schemaVersion(VERSION)
            .build()
        val completedResponse = DescribeCodeBindingResponse.builder()
            .status(CodeGenerationStatus.CREATE_COMPLETE)
            .schemaVersion(VERSION)
            .build()

        val maxAttempts = 2

        mockSchemasClient.stub {
            on { describeCodeBinding(describeCodeBindingRequest) }.thenReturn(inProgressResponse)
                .thenReturn(inProgressResponse)
                .thenReturn(completedResponse)
        }

        assertThatThrownBy {
            val pollingSettings = CodeGenerationStatusPoller.PollingSettings(Duration.ofMillis(10), maxAttempts)
            CodeGenerationStatusPoller(mockSchemasClient, pollingSettings).pollForCompletion(REQUEST).toCompletableFuture().get()
        }.hasRootCauseInstanceOf(WaiterTimeoutException::class.java)

        verify(mockSchemasClient, times(2)).describeCodeBinding(describeCodeBindingRequest)
    }

    @Test
    fun canDownloadGeneratedCode() {
        val getCodeBindingRequest = GetCodeBindingSourceRequest.builder()
            .schemaName(SCHEMA)
            .registryName(REGISTRY)
            .language(LANGUAGE.apiValue)
            .schemaVersion(VERSION)
            .build()

        val zipByteBuffer = mock<ByteBuffer>()

        val sdkBytesResponse = mock<SdkBytes> {
            on { asByteBuffer() }.thenReturn(zipByteBuffer)
        }

        val getCodeBindingResponse = GetCodeBindingSourceResponse.builder()
            .body(sdkBytesResponse)
            .build()

        mockSchemasClient.stub {
            on { getCodeBindingSource(getCodeBindingRequest) }.thenReturn(getCodeBindingResponse)
        }

        val downloadedSchemaCode = CodeDownloader(mockSchemasClient).download(REQUEST).toCompletableFuture().get()

        verify(mockSchemasClient).getCodeBindingSource(getCodeBindingRequest)

        assertThat(downloadedSchemaCode.zipContents).isEqualTo(zipByteBuffer)
    }

    @Test
    fun downloadGeneratedCodeWrapsExceptions() {
        val someException = IllegalStateException()

        mockSchemasClient.stub {
            on { getCodeBindingSource(any<GetCodeBindingSourceRequest>()) }.thenThrow(someException)
        }

        assertThatThrownBy {
            CodeDownloader(mockSchemasClient).download(REQUEST).toCompletableFuture().get()
        }.hasRootCause(someException)
    }

    @Test
    fun downloadGeneratedCodeDoesNotWrapNotFoundException() {
        val notFoundException = NotFoundException.builder().build()

        mockSchemasClient.stub {
            on { getCodeBindingSource(any<GetCodeBindingSourceRequest>()) }.thenThrow(notFoundException)
        }

        assertThatThrownBy {
            CodeDownloader(mockSchemasClient).download(REQUEST).toCompletableFuture().get()
        }.hasRootCause(notFoundException)
    }

    @Test
    fun canExtractZipFile() {
        initializeRealSourceAndDestinationFolders()

        // Initialize directories and files to put into a zip file
        val directory = File(SOURCE_FOLDER_FILE, ZIP_FOLDER_HIERARCHY)
        val file1 = File(directory, ZIP_FILE_1)
        val file2 = File(directory, ZIP_FILE_2)
        val file3 = File(directory, ZIP_FILE_SCHEMA_CORE_CODE_FILE_NAME)
        assertThat(directory.mkdirs()).isTrue()
        assertThat(file1.createNewFile()).isTrue()
        assertThat(file2.createNewFile()).isTrue()
        assertThat(file3.createNewFile()).isTrue()

        file1.writeText(SOME_TEXT)
        file2.writeText(SOME_TEXT)
        file3.writeText(SOME_TEXT)

        assertThat(SOURCE_FOLDER_FILE.exists()).isTrue()
        assertThat(DESTINATION_FOLDER_FILE.exists()).isTrue()

        // Write all to zip file, and put in a ByteBuffer
        Compressor.Zip(ZIP_FILE).use {
            it.addDirectory(SOURCE_FOLDER_FILE)
        }
        val byteBufferZipContents = fileToByteBuffer(ZIP_FILE)
        val downloadedSchemaCode = DownloadedSchemaCode(byteBufferZipContents)

        val realDestinationRequest = SchemaCodeDownloadRequestDetails(SCHEMA_SUMMARY, VERSION, LANGUAGE, DESTINATION_FOLDER)

        // Invoke CodeExtractor which should unzip the files and places in new directory
        val schemaCoreCodeFile = CodeExtractor().extractAndPlace(realDestinationRequest, downloadedSchemaCode).toCompletableFuture().get()

        // Assert zip itself exists
        val destinationFolderFileZipFolder = Paths.get(DESTINATION_FOLDER, ZIP_FOLDER_HIERARCHY).toFile()
        assertThat(destinationFolderFileZipFolder.exists()).isTrue()

        // Assert files unzipped and exist
        val extractedFile1 = Paths.get(destinationFolderFileZipFolder.path, ZIP_FILE_1).toFile()
        val extractedFile2 = Paths.get(destinationFolderFileZipFolder.path, ZIP_FILE_2).toFile()
        val extractedFile3 = Paths.get(destinationFolderFileZipFolder.path, ZIP_FILE_SCHEMA_CORE_CODE_FILE_NAME).toFile()

        assertThat(extractedFile1.exists()).isTrue()
        assertThat(extractedFile2.exists()).isTrue()
        assertThat(extractedFile3.exists()).isTrue()

        // Assert the schema core code file exists, and is returned
        assertThat(schemaCoreCodeFile).isNotNull()
        schemaCoreCodeFile?.let {
            assertThat(schemaCoreCodeFile.exists()).isTrue()
            assertThat(schemaCoreCodeFile.name).isEqualTo(ZIP_FILE_SCHEMA_CORE_CODE_FILE_NAME)
        }
    }

    @Test
    fun canValidateZipFileDirectoryFileContentsClash() {
        initializeRealSourceAndDestinationFolders()

        // Initialize directories and files to put into a zip file
        val sourceDirectory = File(SOURCE_FOLDER_FILE, ZIP_FOLDER_HIERARCHY)
        val sourceFile = File(sourceDirectory, ZIP_FILE_SCHEMA_CORE_CODE_FILE_NAME)

        // Initialize a destination directory and files that clash with source contents
        val destinationDirectory = File(DESTINATION_FOLDER_FILE, ZIP_FOLDER_HIERARCHY)
        val destinationFile = File(destinationDirectory, ZIP_FILE_SCHEMA_CORE_CODE_FILE_NAME)

        assertThat(sourceDirectory.mkdirs()).isTrue()
        assertThat(sourceFile.createNewFile()).isTrue()

        assertThat(destinationDirectory.mkdirs()).isTrue()
        assertThat(destinationFile.createNewFile()).isTrue()

        // Write some known content to the file in order to detect that it's not overwritten later
        val expectedExistingContent = "ExistingContentInFile"
        FileOutputStream(destinationFile).channel.use { fileChannel ->
            fileChannel.write(ByteBuffer.wrap(expectedExistingContent.toByteArray()))
        }

        // Write all to zip file, and put in a ByteBuffer
        Compressor.Zip(ZIP_FILE).use {
            it.addDirectory(SOURCE_FOLDER_FILE)
        }
        val byteBufferZipContents = fileToByteBuffer(ZIP_FILE)
        val downloadedSchemaCode = DownloadedSchemaCode(byteBufferZipContents)

        val realDestinationRequest = SchemaCodeDownloadRequestDetails(SCHEMA_SUMMARY, VERSION, LANGUAGE, DESTINATION_FOLDER)

        // Invoke CodeExtractor which should throw an exception and not overwrite the destination files
        val exception = catchThrowable { CodeExtractor().extractAndPlace(realDestinationRequest, downloadedSchemaCode).toCompletableFuture().get() }

        assertThat(ExceptionUtils.getRootCause(exception)).isInstanceOf(SchemaCodeDownloadFileCollisionException::class.java)

        // Directory and File already exists
        assertThat(destinationDirectory.exists()).isTrue()
        assertThat(destinationFile.exists()).isTrue()

        // Read the file and verify it's the unmodified content
        val actualContent = String(Files.readAllBytes(destinationFile.toPath()))
        assertThat(actualContent).isEqualTo(expectedExistingContent)
    }

    @Test
    fun canValidateZipFileDirectoryDirectoryOnlyClashes() {
        initializeRealSourceAndDestinationFolders()

        // Initialize directories and files to put into a zip file
        val sourceDirectory = File(SOURCE_FOLDER_FILE, ZIP_FOLDER_HIERARCHY)
        val sourceFile = File(sourceDirectory, ZIP_FILE_SCHEMA_CORE_CODE_FILE_NAME)

        // Initialize a destination directory and files that clash with source contents
        val destinationDirectory = File(DESTINATION_FOLDER_FILE, ZIP_FOLDER_HIERARCHY)
        val destinationFile = File(destinationDirectory, ZIP_FILE_SCHEMA_CORE_CODE_FILE_NAME)

        assertThat(sourceDirectory.mkdirs()).isTrue()
        assertThat(sourceFile.createNewFile()).isTrue()

        assertThat(destinationDirectory.mkdirs()).isTrue()
        assertThat(destinationDirectory.isDirectory).isTrue()
        assertThat(destinationFile.exists()).isFalse()

        // Write all to zip file, and put in a ByteBuffer
        Compressor.Zip(ZIP_FILE).use {
            it.addDirectory(SOURCE_FOLDER_FILE)
        }
        val byteBufferZipContents = fileToByteBuffer(ZIP_FILE)
        val downloadedSchemaCode = DownloadedSchemaCode(byteBufferZipContents)

        val realDestinationRequest = SchemaCodeDownloadRequestDetails(SCHEMA_SUMMARY, VERSION, LANGUAGE, DESTINATION_FOLDER)

        // Invoke CodeExtractor which should not throw any
        CodeExtractor().extractAndPlace(realDestinationRequest, downloadedSchemaCode).toCompletableFuture().get()

        // Directory and File already exist
        assertThat(destinationDirectory.exists()).isTrue()
        assertThat(destinationFile.exists()).isTrue()
    }

    @Test
    fun canUpdateProgress() {
        val progressIndicator = mock<ProgressIndicator>()
        val newStatus = "new status"

        ProgressUpdater().updateProgress(progressIndicator, newStatus).toCompletableFuture().get()

        verify(progressIndicator).isIndeterminate = true
        verify(progressIndicator).text = newStatus
    }

    @Test
    fun canDownloadCodeFirstInvocationPath() {
        standardDependencyMockInitialization()

        val schema = SchemaCodeDownloader(codeGenerator, codePoller, codeDownloader, codeExtractor, progressUpdater)
            .downloadCode(REQUEST, progressIndicator).toCompletableFuture().get()
        assertThat(schema).isEqualTo(schemaCodeCoreFile)

        // Assert no error notifications
        assertThat(errorNotification?.dropDownText).isNull()

        verify(codeGenerator).generate(REQUEST)
        verify(codePoller).pollForCompletion(REQUEST)
        verify(codeDownloader, times(2)).download(REQUEST)
        verify(codeExtractor).extractAndPlace(REQUEST, downloadedSchemaCode)
        verify(progressUpdater, times(4)).updateProgress(eq(progressIndicator), any())
    }

    @Test
    fun canDownloadCodeCodeGeneratedImmediately() {
        standardDependencyMockInitialization()

        codeGenerator.stub {
            on { generate(REQUEST) }.thenReturn(completedFuture(CodeGenerationStatus.CREATE_COMPLETE))
        }

        val schema = SchemaCodeDownloader(codeGenerator, codePoller, codeDownloader, codeExtractor, progressUpdater)
            .downloadCode(REQUEST, progressIndicator).toCompletableFuture().get()
        assertThat(schema).isEqualTo(schemaCodeCoreFile)

        // Assert no error notifications
        assertThat(errorNotification?.dropDownText).isNull()

        verify(codeGenerator).generate(REQUEST)
        verify(codePoller, times(0)).pollForCompletion(REQUEST)
        verify(codeDownloader, times(2)).download(REQUEST)
        verify(codeExtractor).extractAndPlace(REQUEST, downloadedSchemaCode)
        verify(progressUpdater, times(4)).updateProgress(eq(progressIndicator), any())
    }

    @Test
    fun canDownloadAlreadyGeneratedCode() {
        standardDependencyMockInitialization()

        codeDownloader.stub {
            on { download(REQUEST) }.thenReturn(completedFuture(downloadedSchemaCode))
        }

        val schema = SchemaCodeDownloader(codeGenerator, codePoller, codeDownloader, codeExtractor, progressUpdater)
                .downloadCode(REQUEST, progressIndicator).toCompletableFuture().get()
        assertThat(schema).isEqualTo(schemaCodeCoreFile)

        // Assert no error notifications
        assertThat(errorNotification?.dropDownText).isNull()

        verify(codeGenerator, times(0)).generate(REQUEST)
        verify(codePoller, times(0)).pollForCompletion(REQUEST)
        verify(codeDownloader).download(REQUEST)
        verify(codeExtractor).extractAndPlace(REQUEST, downloadedSchemaCode)
        verify(progressUpdater, times(2)).updateProgress(eq(progressIndicator), any())
    }

    @Test
    fun canDownloadHandleFailedToGenerateCodeCall() {
        standardDependencyMockInitialization()

        val someException = InternalServerErrorException.builder().build()

        codeGenerator.stub {
            on { generate(REQUEST) }.thenReturn(failedFuture(someException))
        }

        assertThatThrownBy {
            SchemaCodeDownloader(codeGenerator, codePoller, codeDownloader, codeExtractor, progressUpdater)
                .downloadCode(REQUEST, progressIndicator).toCompletableFuture().get()
        }.hasRootCause(someException)

        // Assert no error notifications
        assertThat(errorNotification?.dropDownText).isNull()

        verify(codeGenerator).generate(REQUEST)
        verify(codePoller, times(0)).pollForCompletion(REQUEST)
        verify(codeDownloader).download(REQUEST)
        verify(codeExtractor, times(0)).extractAndPlace(REQUEST, downloadedSchemaCode)
        verify(progressUpdater, times(2)).updateProgress(eq(progressIndicator), any())
    }

    @Test
    fun canDownloadHandleFailedToPollCode() {
        standardDependencyMockInitialization()

        val someException = InternalServerErrorException.builder().build()

        codePoller.stub {
            on { pollForCompletion(REQUEST) }.thenReturn(failedFuture(someException))
        }

        assertThatThrownBy {
            SchemaCodeDownloader(codeGenerator, codePoller, codeDownloader, codeExtractor, progressUpdater)
                .downloadCode(REQUEST, progressIndicator).toCompletableFuture().get()
        }.hasRootCause(someException)

        // Assert no error notifications
        assertThat(errorNotification?.dropDownText).isNull()

        verify(codeGenerator).generate(REQUEST)
        verify(codeDownloader).download(REQUEST)
        verify(codePoller).pollForCompletion(REQUEST)
        verify(codeExtractor, times(0)).extractAndPlace(REQUEST, downloadedSchemaCode)
        verify(progressUpdater, times(2)).updateProgress(eq(progressIndicator), any())
    }

    @Test
    fun canDownloadHandleFailedToPollCodeTimeout() {
        standardDependencyMockInitialization()

        val waiterTimeoutException = WaiterTimeoutException("")

        codePoller.stub {
            on { pollForCompletion(REQUEST) }.thenReturn(failedFuture(waiterTimeoutException))
        }

        assertThatThrownBy {
            SchemaCodeDownloader(codeGenerator, codePoller, codeDownloader, codeExtractor, progressUpdater)
                .downloadCode(REQUEST, progressIndicator).toCompletableFuture().get()
        }.hasRootCause(waiterTimeoutException)

        // Assert no error notifications
        assertThat(errorNotification?.dropDownText).isNull()

        verify(codeGenerator).generate(REQUEST)
        verify(codePoller).pollForCompletion(REQUEST)
        verify(codeDownloader).download(REQUEST)
        verify(codeExtractor, times(0)).extractAndPlace(REQUEST, downloadedSchemaCode)
        verify(progressUpdater, times(2)).updateProgress(eq(progressIndicator), any())
    }

    @Test
    fun canDownloadHandleFailedToDownloadCodeFirstCall() {
        standardDependencyMockInitialization()

        val someException = InternalServerErrorException.builder().build()
        codeDownloader.stub {
            on { download(REQUEST) }.thenReturn(failedFuture(someException))
        }

        assertThatThrownBy {
            SchemaCodeDownloader(codeGenerator, codePoller, codeDownloader, codeExtractor, progressUpdater)
                .downloadCode(REQUEST, progressIndicator).toCompletableFuture().get()
        }.hasRootCause(someException)

        // Assert no error notifications
        assertThat(errorNotification?.dropDownText).isNull()

        verify(codeGenerator, times(0)).generate(REQUEST)
        verify(codePoller, times(0)).pollForCompletion(REQUEST)
        verify(codeDownloader).download(REQUEST)
        verify(codeExtractor, times(0)).extractAndPlace(REQUEST, downloadedSchemaCode)
        verify(progressUpdater).updateProgress(eq(progressIndicator), any())
    }

    @Test
    fun canDownloadHandleFailedToDownloadCodeSecondCall() {
        standardDependencyMockInitialization()

        val notFoundException = NotFoundException.builder().build()
        codeDownloader.stub {
            on { codeDownloader.download(REQUEST) }.thenReturn(failedFuture(notFoundException))
        }

        assertThatThrownBy {
            SchemaCodeDownloader(codeGenerator, codePoller, codeDownloader, codeExtractor, progressUpdater)
                .downloadCode(REQUEST, progressIndicator).toCompletableFuture().get()
        }.hasRootCause(notFoundException)

        // Assert no error notifications
        assertThat(errorNotification?.dropDownText).isNull()

        verify(codeGenerator).generate(REQUEST)
        verify(codePoller).pollForCompletion(REQUEST)
        verify(codeDownloader, times(2)).download(REQUEST)
        verify(codeExtractor, times(0)).extractAndPlace(REQUEST, downloadedSchemaCode)
        verify(progressUpdater, times(3)).updateProgress(eq(progressIndicator), any())
    }

    @Test
    fun canDownloadHandleFailedToExtractCode() {
        standardDependencyMockInitialization()

        val someException = InternalServerErrorException.builder().build()

        codeExtractor.stub {
            on { extractAndPlace(REQUEST, downloadedSchemaCode) }.thenReturn(failedFuture(someException))
        }

        assertThatThrownBy {
            SchemaCodeDownloader(codeGenerator, codePoller, codeDownloader, codeExtractor, progressUpdater)
                .downloadCode(REQUEST, progressIndicator).toCompletableFuture().get()
        }.hasRootCause(someException)

        // Assert no error notifications
        assertThat(errorNotification?.dropDownText).isNull()

        verify(codeGenerator).generate(REQUEST)
        verify(codePoller).pollForCompletion(REQUEST)
        verify(codeDownloader, times(2)).download(REQUEST)
        verify(codeExtractor).extractAndPlace(REQUEST, downloadedSchemaCode)
        verify(progressUpdater, times(4)).updateProgress(eq(progressIndicator), any())
    }

    @Test
    fun canDownloadHandleCodeHierarchyCollision() {
        standardDependencyMockInitialization()

        val schemaCodeDownloadFileCollisionException = SchemaCodeDownloadFileCollisionException("SomeFile")

        codeExtractor.stub {
            on { extractAndPlace(REQUEST, downloadedSchemaCode) }.thenReturn(failedFuture(schemaCodeDownloadFileCollisionException))
        }

        assertThatThrownBy {
            SchemaCodeDownloader(codeGenerator, codePoller, codeDownloader, codeExtractor, progressUpdater)
                .downloadCode(REQUEST, progressIndicator).toCompletableFuture().get()
        }.hasRootCause(schemaCodeDownloadFileCollisionException)

        // Assert no error notifications
        assertThat(errorNotification?.dropDownText).isNull()

        verify(codeGenerator).generate(REQUEST)
        verify(codePoller).pollForCompletion(REQUEST)
        verify(codeDownloader, times(2)).download(REQUEST)
        verify(codeExtractor).extractAndPlace(REQUEST, downloadedSchemaCode)
        verify(progressUpdater, times(4)).updateProgress(eq(progressIndicator), any())
    }

    private fun initializeRealSourceAndDestinationFolders() {
        SOURCE_FOLDER_FILE = tempFolder.newFolder()
        ZIP_FILE = tempFolder.newFile()
        DESTINATION_FOLDER_FILE = tempFolder.newFolder()

        SOURCE_FOLDER = SOURCE_FOLDER_FILE.path
        ZIP_FILE_PATH = ZIP_FILE.path
        DESTINATION_FOLDER = DESTINATION_FOLDER_FILE.path

        assertThat(SOURCE_FOLDER).isNotEqualTo(DESTINATION_FOLDER)

        assertThat(SOURCE_FOLDER_FILE.exists()).isTrue()
        assertThat(SOURCE_FOLDER_FILE.isDirectory).isTrue()
        assertThat(ZIP_FILE.exists()).isTrue()
        assertThat(ZIP_FILE.isFile).isTrue()
        assertThat(DESTINATION_FOLDER_FILE.exists()).isTrue()
        assertThat(DESTINATION_FOLDER_FILE.isDirectory).isTrue()
    }

    private fun standardDependencyMockInitialization() {
        codeDownloader.stub {
            on { download(REQUEST) }.thenReturn(failedFuture(NotFoundException.builder().build()))
                .thenReturn(completedFuture(downloadedSchemaCode))
        }

        codeGenerator.stub {
            on { generate(REQUEST) }.thenReturn(completedFuture(CodeGenerationStatus.CREATE_IN_PROGRESS))
        }

        codePoller.stub {
            on { pollForCompletion(eq(REQUEST), any()) }.thenReturn(completedFuture(SCHEMA))
        }

        codeExtractor.stub {
            on { extractAndPlace(REQUEST, downloadedSchemaCode) }.thenReturn(completedFuture(schemaCodeCoreFile))
        }

        progressUpdater.stub {
            on { updateProgress(eq(progressIndicator), any()) }.thenReturn(completedFuture(null))
        }
    }

    private fun subscribeToNotifications() {
        val project = projectRule.project

        val messageBus = project.messageBus.connect()

        messageBus.setDefaultHandler { _, params ->
            errorNotification = params[0] as Notification
        }
        messageBus.subscribe(Notifications.TOPIC)
    }

    private fun fileToByteBuffer(file: File): ByteBuffer = ByteBuffer.wrap(Files.readAllBytes(file.toPath()))
}
