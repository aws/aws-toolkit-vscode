// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.schemas.code

import com.intellij.notification.Notification
import com.intellij.notification.Notifications
import com.intellij.openapi.progress.ProgressIndicator
import com.intellij.testFramework.ProjectRule
import com.intellij.testFramework.runInEdtAndWait
import com.intellij.util.io.Compressor
import io.mockk.Called
import io.mockk.called
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import org.apache.commons.lang.exception.ExceptionUtils
import org.assertj.core.api.Assertions.assertThat
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
import software.amazon.awssdk.services.schemas.model.DescribeSchemaResponse
import software.amazon.awssdk.services.schemas.model.GetCodeBindingSourceRequest
import software.amazon.awssdk.services.schemas.model.GetCodeBindingSourceResponse
import software.amazon.awssdk.services.schemas.model.InternalServerErrorException
import software.amazon.awssdk.services.schemas.model.NotFoundException
import software.amazon.awssdk.services.schemas.model.PutCodeBindingRequest
import software.amazon.awssdk.services.schemas.model.PutCodeBindingResponse
import software.aws.toolkits.core.utils.WaiterTimeoutException
import software.aws.toolkits.jetbrains.core.MockClientManagerRule
import software.aws.toolkits.jetbrains.core.MockResourceCache
import software.aws.toolkits.jetbrains.core.credentials.MockProjectAccountSettingsManager
import software.aws.toolkits.jetbrains.services.schemas.SchemaCodeLangs
import software.aws.toolkits.jetbrains.services.schemas.SchemaSummary
import software.aws.toolkits.jetbrains.services.schemas.resources.SchemasResources
import java.io.File
import java.io.FileOutputStream
import java.nio.ByteBuffer
import java.nio.file.Files
import java.nio.file.Paths
import java.time.Duration
import java.util.concurrent.CompletableFuture
import kotlin.test.fail

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

    private val CREDENTIAL_IDENTIFIER = MockProjectAccountSettingsManager.MOCK_CREDENTIALS_NAME
    private val REGION = MockProjectAccountSettingsManager.getInstance(projectRule.project).activeRegion.id
    private val REGISTRY = "registry"
    private val SCHEMA = "schema"
    private val FAKE_DESTINATION = "/some/destination/anything/really"
    private val SCHEMA_SUMMARY = SchemaSummary(SCHEMA, REGISTRY)
    private val VERSION = "2"
    private val LANGUAGE = SchemaCodeLangs.JAVA8
    private val MAX_ATTEMPTS = 5
    private val POLLING_SETTINGS = CodeGenerationStatusPoller.PollingSettings(Duration.ofMillis(10), MAX_ATTEMPTS)
    private val REQUEST = SchemaCodeDownloadRequestDetails(SCHEMA_SUMMARY, VERSION, LANGUAGE, FAKE_DESTINATION)
    private val ZIP_FILE_SCHEMA_CORE_CODE_FILE_NAME = REQUEST.schemaCoreCodeFileName()

    private val mockSchemasClient = mockk<SchemasClient>()
    private val codeGenerator = mockk<CodeGenerator>()
    private val codePoller = mockk<CodeGenerationStatusPoller>()
    private val codeDownloader = mockk<CodeDownloader>()
    private val codeExtractor = mockk<CodeExtractor>()
    private val progressUpdater = mockk<ProgressUpdater>()
    private val progressIndicator = mockk<ProgressIndicator>()
    private val downloadedSchemaCode = mockk<DownloadedSchemaCode>()
    private val schemaCodeCoreFile = mockk<File>()

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

        every { mockSchemasClient.putCodeBinding(putCodeBindingRequest) } returns putCodeBindingResponse

        val codeGenerationStatus = CodeGenerator(mockSchemasClient).generate(REQUEST).toCompletableFuture().get()

        verify { mockSchemasClient.putCodeBinding(putCodeBindingRequest) }
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

        every { mockSchemasClient.describeCodeBinding(describeCodeBindingRequest) } returns describeCodeBindingResponse

        val actualCodeGenerationStatus = CodeGenerationStatusPoller(mockSchemasClient).getCurrentStatus(REQUEST).toCompletableFuture().get()

        verify { mockSchemasClient.describeCodeBinding(describeCodeBindingRequest) }
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

        every { mockSchemasClient.describeCodeBinding(describeCodeBindingRequest) } returns
            inProgressResponse andThen
            inProgressResponse andThen
            inProgressResponse andThen
            completedResponse

        val createdSchemaName = CodeGenerationStatusPoller(mockSchemasClient).pollForCompletion(REQUEST).toCompletableFuture().get()

        verify(exactly = 4) { mockSchemasClient.describeCodeBinding(describeCodeBindingRequest) }
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

        every { mockSchemasClient.describeCodeBinding(describeCodeBindingRequest) } returns
            inProgressResponse andThen
            inProgressResponse andThen
            completedResponse // After maxAttempts

        try {
            val pollingSettings = CodeGenerationStatusPoller.PollingSettings(Duration.ofMillis(10), maxAttempts)
            CodeGenerationStatusPoller(mockSchemasClient, pollingSettings).pollForCompletion(REQUEST).toCompletableFuture().get()
        } catch (e: Exception) {
            assertThat(ExceptionUtils.getRootCause(e)::class).isEqualTo(WaiterTimeoutException::class)
            verify(exactly = 2) { mockSchemasClient.describeCodeBinding(describeCodeBindingRequest) }
            return
        }
        fail("Should never get here")
    }

    @Test
    fun canDownloadGeneratedCode() {
        val getCodeBindingRequest = GetCodeBindingSourceRequest.builder()
            .schemaName(SCHEMA)
            .registryName(REGISTRY)
            .language(LANGUAGE.apiValue)
            .schemaVersion(VERSION)
            .build()

        val sdkBytesResponse = mockk<SdkBytes>()
        val zipByteBuffer = mockk<ByteBuffer>()
        every { sdkBytesResponse.asByteBuffer() } returns zipByteBuffer

        val getCodeBindingResponse = GetCodeBindingSourceResponse.builder()
            .body(sdkBytesResponse)
            .build()

        every { mockSchemasClient.getCodeBindingSource(getCodeBindingRequest) } returns getCodeBindingResponse

        val downloadedSchemaCode = CodeDownloader(mockSchemasClient).download(REQUEST).toCompletableFuture().get()

        verify { mockSchemasClient.getCodeBindingSource(getCodeBindingRequest) }

        assertThat(downloadedSchemaCode.zipContents).isEqualTo(zipByteBuffer)
    }

    @Test
    fun downloadGeneratedCodeWrapsExceptions() {
        val someException = IllegalStateException()
        every { mockSchemasClient.getCodeBindingSource(ofType(GetCodeBindingSourceRequest::class)) } throws someException

        var future = CompletableFuture<DownloadedSchemaCode>()
        runInEdtAndWait() {
            future = CodeDownloader(mockSchemasClient).download(REQUEST).toCompletableFuture()
        }

        try {
            future.get()
        } catch (e: Exception) {
            assertThat(e.cause!!::class).isEqualTo(RuntimeException::class)
            assertThat(ExceptionUtils.getRootCause(e)).isEqualTo(someException)
            return
        }
        fail("Should never get here")
    }

    @Test
    fun downloadGeneratedCodeDoesNotWrapNotFoundException() {
        val notFoundException = NotFoundException.builder().build()
        every { mockSchemasClient.getCodeBindingSource(ofType(GetCodeBindingSourceRequest::class)) } throws notFoundException

        var future = CompletableFuture<DownloadedSchemaCode>()
        runInEdtAndWait() {
            future = CodeDownloader(mockSchemasClient).download(REQUEST).toCompletableFuture()
        }

        try {
            future.get()
        } catch (e: Exception) {
            assertThat(e.cause).isEqualTo(notFoundException)
            return
        }
        fail("Should never get here")
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

        // Directory and File alraedy exists
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

        // Directory and File alraedy exist
        assertThat(destinationDirectory.exists()).isTrue()
        assertThat(destinationFile.exists()).isTrue()
    }

    @Test
    fun canUpdateProgress() {
        val progressIndicator: ProgressIndicator = mockk<ProgressIndicator>(relaxUnitFun = true) // Relaxed required because calling a void java setter
        val newStatus = "new status"

        val future = ProgressUpdater().updateProgress(progressIndicator, newStatus)
        future.toCompletableFuture().get()

        verify { progressIndicator.setIndeterminate(true) }
        verify { progressIndicator.text = newStatus }
    }

    @Test
    fun canDownloadCodeFirstInvocationPath() {
        standardDependencyMockInitialization()

        var future = CompletableFuture<File?>()
        runInEdtAndWait() {
            future = SchemaCodeDownloader(codeGenerator, codePoller, codeDownloader, codeExtractor, progressUpdater)
                .downloadCode(REQUEST, progressIndicator).toCompletableFuture()
        }
        assertThat(future.get()).isEqualTo(schemaCodeCoreFile)

        // Assert no error notifications
        assertThat(errorNotification?.dropDownText).isNull()

        verify { codeGenerator.generate(REQUEST) }
        verify { codePoller.pollForCompletion(REQUEST) }
        verify(exactly = 2) { codeDownloader.download(REQUEST) }
        verify { codeExtractor.extractAndPlace(REQUEST, downloadedSchemaCode) }
        verify(exactly = 4) { progressUpdater.updateProgress(progressIndicator, any()) }
    }

    @Test
    fun canDownloadCodeCodeGeneratedImmediately() {
        standardDependencyMockInitialization()

        every { codeGenerator.generate(REQUEST) } returns completableFutureOf(CodeGenerationStatus.CREATE_COMPLETE)

        var future = CompletableFuture<File?>()
        runInEdtAndWait() {
            future = SchemaCodeDownloader(codeGenerator, codePoller, codeDownloader, codeExtractor, progressUpdater)
                .downloadCode(REQUEST, progressIndicator).toCompletableFuture()
        }
        assertThat(future.get()).isEqualTo(schemaCodeCoreFile)

        // Assert no error notifications
        assertThat(errorNotification?.dropDownText).isNull()

        verify { codeGenerator.generate(REQUEST) }
        verify { codePoller.pollForCompletion(REQUEST) wasNot Called }
        verify(exactly = 2) { codeDownloader.download(REQUEST) }
        verify { codeExtractor.extractAndPlace(REQUEST, downloadedSchemaCode) }
        verify(exactly = 4) { progressUpdater.updateProgress(progressIndicator, any()) }
    }

    @Test
    fun canDownloadAlreadyGeneratedCode() {
        standardDependencyMockInitialization()

        every { codeDownloader.download(REQUEST) } returns
            completableFutureOf(downloadedSchemaCode) // Return code from first time

        var future = CompletableFuture<File?>()
        runInEdtAndWait() {
            future = SchemaCodeDownloader(codeGenerator, codePoller, codeDownloader, codeExtractor, progressUpdater)
                .downloadCode(REQUEST, progressIndicator).toCompletableFuture()
        }
        assertThat(future.get()).isEqualTo(schemaCodeCoreFile)

        // Assert no error notifications
        assertThat(errorNotification?.dropDownText).isNull()

        verify(exactly = 1) { codeDownloader.download(REQUEST) }
        verify { codeGenerator.generate(any()) wasNot Called }
        verify { codePoller.pollForCompletion(any()) wasNot Called }
        verify { codeExtractor.extractAndPlace(REQUEST, downloadedSchemaCode) }
        verify(exactly = 2) { progressUpdater.updateProgress(progressIndicator, any()) }
    }

    @Test
    fun canDownloadHandleFailedToGenerateCodeCall() {
        standardDependencyMockInitialization()

        val someException = InternalServerErrorException.builder().build()

        every { codeGenerator.generate(REQUEST) } returns
            completableFutureOfException(someException)

        var future = CompletableFuture<File?>()
        runInEdtAndWait() {
            future = SchemaCodeDownloader(codeGenerator, codePoller, codeDownloader, codeExtractor, progressUpdater)
                .downloadCode(REQUEST, progressIndicator).toCompletableFuture()
        }

        try {
            future.get()
        } catch (e: Exception) {
            assertThat(ExceptionUtils.getRootCause(e)).isEqualTo(someException)

            // Assert no error notifications
            assertThat(errorNotification?.dropDownText).isNull()

            verify(exactly = 1) { codeGenerator.generate(REQUEST) }
            verify { codePoller.pollForCompletion(REQUEST) wasNot called }
            verify(exactly = 1) { codeDownloader.download(REQUEST) }
            verify { codeExtractor.extractAndPlace(REQUEST, downloadedSchemaCode) wasNot Called }
            verify(exactly = 2) { progressUpdater.updateProgress(progressIndicator, any()) }
            return
        }

        fail("Should never get here")
    }

    @Test
    fun canDownloadHandleFailedToPollCode() {
        standardDependencyMockInitialization()

        val someException = InternalServerErrorException.builder().build()

        every { codePoller.pollForCompletion(REQUEST) } returns completableFutureOfException(someException)

        var future = CompletableFuture<File?>()
        runInEdtAndWait() {
            future = SchemaCodeDownloader(codeGenerator, codePoller, codeDownloader, codeExtractor, progressUpdater)
                .downloadCode(REQUEST, progressIndicator).toCompletableFuture()
        }

        try {
            future.get()
        } catch (e: Exception) {
            assertThat(ExceptionUtils.getRootCause(e)).isEqualTo(someException)

            // Assert no error notifications
            assertThat(errorNotification?.dropDownText).isNull()

            verify(exactly = 1) { codeGenerator.generate(REQUEST) }
            verify(exactly = 1) { codePoller.pollForCompletion(REQUEST) }
            verify(exactly = 1) { codeDownloader.download(REQUEST) }
            verify { codeExtractor.extractAndPlace(REQUEST, downloadedSchemaCode) wasNot Called }
            verify(exactly = 2) { progressUpdater.updateProgress(progressIndicator, any()) }
            return
        }

        fail("Should never get here")
    }

    @Test
    fun canDownloadHandleFailedToPollCodeTimeout() {
        standardDependencyMockInitialization()

        val waiterTimeoutException = WaiterTimeoutException("")

        every { codePoller.pollForCompletion(REQUEST) } returns completableFutureOfException(waiterTimeoutException)

        var future = CompletableFuture<File?>()
        runInEdtAndWait() {
            future = SchemaCodeDownloader(codeGenerator, codePoller, codeDownloader, codeExtractor, progressUpdater)
                .downloadCode(REQUEST, progressIndicator).toCompletableFuture()
        }

        try {
            future.get()
        } catch (e: Exception) {
            assertThat(ExceptionUtils.getRootCause(e)).isEqualTo(waiterTimeoutException)

            // Assert no error notifications
            assertThat(errorNotification?.dropDownText).isNull()

            verify(exactly = 1) { codeGenerator.generate(REQUEST) }
            verify(exactly = 1) { codePoller.pollForCompletion(REQUEST) }
            verify(exactly = 1) { codeDownloader.download(REQUEST) }
            verify { codeExtractor.extractAndPlace(REQUEST, downloadedSchemaCode) wasNot Called }
            verify(exactly = 2) { progressUpdater.updateProgress(progressIndicator, any()) }
            return
        }

        fail("Should never get here")
    }

    @Test
    fun canDownloadHandleFailedToDownloadCodeFirstCall() {
        standardDependencyMockInitialization()

        val someException = InternalServerErrorException.builder().build()
        every { codeDownloader.download(REQUEST) } returns
            completableFutureOfException(someException)

        var future = CompletableFuture<File?>()
        runInEdtAndWait() {
            future = SchemaCodeDownloader(codeGenerator, codePoller, codeDownloader, codeExtractor, progressUpdater)
                .downloadCode(REQUEST, progressIndicator).toCompletableFuture()
        }

        try {
            future.get()
        } catch (e: Exception) {
            assertThat(ExceptionUtils.getRootCause(e)).isEqualTo(someException)

            // Assert no error notifications
            assertThat(errorNotification?.dropDownText).isNull()

            verify { codeGenerator.generate(REQUEST) wasNot Called }
            verify { codePoller.pollForCompletion(REQUEST) wasNot called }
            verify(exactly = 1) { codeDownloader.download(REQUEST) }
            verify { codeExtractor.extractAndPlace(REQUEST, downloadedSchemaCode) wasNot Called }
            verify(exactly = 1) { progressUpdater.updateProgress(progressIndicator, any()) }
            return
        }

        fail("Should never get here")
    }

    @Test
    fun canDownloadHandleFailedToDownloadCodeSecondCall() {
        standardDependencyMockInitialization()

        val notFoundException = NotFoundException.builder().build()
        every { codeDownloader.download(REQUEST) } returns
            completableFutureOfException(notFoundException)

        var future = CompletableFuture<File?>()
        runInEdtAndWait() {
            future = SchemaCodeDownloader(codeGenerator, codePoller, codeDownloader, codeExtractor, progressUpdater)
                .downloadCode(REQUEST, progressIndicator).toCompletableFuture()
        }

        try {
            future.get()
        } catch (e: Exception) {
            assertThat(ExceptionUtils.getRootCause(e)).isEqualTo(notFoundException)

            // Assert no error notifications
            assertThat(errorNotification?.dropDownText).isNull()

            verify(exactly = 1) { codeGenerator.generate(REQUEST) }
            verify(exactly = 1) { codePoller.pollForCompletion(REQUEST) }
            verify(exactly = 2) { codeDownloader.download(REQUEST) }
            verify { codeExtractor.extractAndPlace(REQUEST, downloadedSchemaCode) wasNot Called }
            verify(exactly = 3) { progressUpdater.updateProgress(progressIndicator, any()) }
            return
        }

        fail("Should never get here")
    }

    @Test
    fun canDownloadHandleFailedToExtractCode() {
        standardDependencyMockInitialization()

        val someException = InternalServerErrorException.builder().build()

        every { codeExtractor.extractAndPlace(REQUEST, downloadedSchemaCode) } returns completableFutureOfException(someException)

        var future = CompletableFuture<File?>()
        runInEdtAndWait() {
            future = SchemaCodeDownloader(codeGenerator, codePoller, codeDownloader, codeExtractor, progressUpdater)
                .downloadCode(REQUEST, progressIndicator).toCompletableFuture()
        }

        try {
            future.get()
        } catch (e: Exception) {
            assertThat(ExceptionUtils.getRootCause(e)).isEqualTo(someException)

            // Assert no error notifications
            assertThat(errorNotification?.dropDownText).isNull()

            verify(exactly = 1) { codeGenerator.generate(REQUEST) }
            verify(exactly = 1) { codePoller.pollForCompletion(REQUEST) }
            verify(exactly = 2) { codeDownloader.download(REQUEST) }
            verify(exactly = 1) { codeExtractor.extractAndPlace(REQUEST, downloadedSchemaCode) }
            verify(exactly = 4) { progressUpdater.updateProgress(progressIndicator, any()) }
            return
        }

        fail("Should never get here")
    }

    @Test
    fun canDownloadHandleCodeHierarchyCollision() {
        standardDependencyMockInitialization()

        val schemaCodeDownloadFileCollisionException = SchemaCodeDownloadFileCollisionException("SomeFile")
        every { codeExtractor.extractAndPlace(REQUEST, downloadedSchemaCode) } returns completableFutureOfException(schemaCodeDownloadFileCollisionException)

        var future = CompletableFuture<File?>()
        runInEdtAndWait() {
            future = SchemaCodeDownloader(codeGenerator, codePoller, codeDownloader, codeExtractor, progressUpdater)
                .downloadCode(REQUEST, progressIndicator).toCompletableFuture()
        }

        try {
            future.get()
        } catch (e: Exception) {
            assertThat(ExceptionUtils.getRootCause(e)).isEqualTo(schemaCodeDownloadFileCollisionException)

            // Assert no error notifications
            assertThat(errorNotification?.dropDownText).isNull()

            verify(exactly = 1) { codeGenerator.generate(REQUEST) }
            verify(exactly = 1) { codePoller.pollForCompletion(REQUEST) }
            verify(exactly = 2) { codeDownloader.download(REQUEST) }
            verify(exactly = 1) { codeExtractor.extractAndPlace(REQUEST, downloadedSchemaCode) }
            verify(exactly = 4) { progressUpdater.updateProgress(progressIndicator, any()) }
            return
        }

        fail("Should never get here")
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
        every { codeDownloader.download(REQUEST) } returns
            completableFutureOfException(NotFoundException.builder().build()) andThen // First time throws exception
            completableFutureOf(downloadedSchemaCode) // Second time returns code

        every { codeGenerator.generate(REQUEST) } returns completableFutureOf(CodeGenerationStatus.CREATE_IN_PROGRESS)
        every { codePoller.pollForCompletion(REQUEST, any()) } returns completableFutureOf(SCHEMA)
        every { codeExtractor.extractAndPlace(REQUEST, downloadedSchemaCode) } returns completableFutureOf(schemaCodeCoreFile)
        every { progressUpdater.updateProgress(progressIndicator, any()) } returns completableFutureOf(null)
    }

    private fun resourceCache() = MockResourceCache.getInstance(projectRule.project)

    private fun MockResourceCache.mockSchemaCache(registryName: String, schemaName: String, schema: DescribeSchemaResponse) {
        this.addEntry(
            SchemasResources.getSchema(registryName, schemaName),
            CompletableFuture.completedFuture(schema))
    }

    fun subscribeToNotifications() {
        val project = projectRule.project

        val messageBus = project.messageBus.connect()

        messageBus.setDefaultHandler { _, params ->
            errorNotification = params[0] as Notification
        }
        messageBus.subscribe(Notifications.TOPIC)
    }

    fun <T> completableFutureOf(obj: T): CompletableFuture<T> {
        val future = CompletableFuture<T>()
        future.complete(obj)
        return future
    }

    fun <T> completableFutureOfException(exception: Exception): CompletableFuture<T> {
        val future = CompletableFuture<T>()
        future.completeExceptionally(exception)
        return future
    }

    fun fileToByteBuffer(file: File): ByteBuffer = ByteBuffer.wrap(Files.readAllBytes(file.toPath()))
}
