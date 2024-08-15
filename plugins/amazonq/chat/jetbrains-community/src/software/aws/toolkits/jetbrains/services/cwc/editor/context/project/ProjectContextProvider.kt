// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cwc.editor.context.project

import com.fasterxml.jackson.annotation.JsonIgnoreProperties
import com.fasterxml.jackson.annotation.JsonProperty
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.fasterxml.jackson.module.kotlin.readValue
import com.intellij.openapi.Disposable
import com.intellij.openapi.project.Project
import com.intellij.openapi.project.guessProjectDir
import com.intellij.openapi.vfs.VfsUtilCore
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.openapi.vfs.VirtualFileVisitor
import com.intellij.openapi.vfs.isFile
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.yield
import software.aws.toolkits.core.utils.debug
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.info
import software.aws.toolkits.core.utils.warn
import software.aws.toolkits.jetbrains.core.coroutines.disposableCoroutineScope
import software.aws.toolkits.jetbrains.services.amazonq.FeatureDevSessionContext
import software.aws.toolkits.jetbrains.services.codewhisperer.settings.CodeWhispererSettings
import software.aws.toolkits.jetbrains.services.cwc.controller.chat.telemetry.TelemetryHelper
import software.aws.toolkits.jetbrains.services.cwc.controller.chat.telemetry.getStartUrl
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger

class ProjectContextProvider(val project: Project, private val encoderServer: EncoderServer) : Disposable {
    private val retryCount = AtomicInteger(0)
    val isIndexComplete = AtomicBoolean(false)
    private val mapper = jacksonObjectMapper()
    private val scope = disposableCoroutineScope(this)
    init {
        scope.launch {
            if (CodeWhispererSettings.getInstance().isProjectContextEnabled()) {
                while (true) {
                    if (encoderServer.isNodeProcessRunning()) {
                        // TODO: need better solution for this
                        delay(10000)
                        initAndIndex()
                        break
                    } else {
                        yield()
                    }
                }
            }
        }
    }
    data class IndexRequestPayload(
        val filePaths: List<String>,
        val projectRoot: String,
        val refresh: Boolean
    )

    data class FileCollectionResult(
        val files: List<String>,
        val fileSize: Int
    )

    data class QueryRequestPayload(
        val query: String
    )

    data class UpdateIndexRequestPayload(
        val filePath: String
    )

    data class Usage(
        @JsonIgnoreProperties(ignoreUnknown = true)
        @JsonProperty("memoryUsage")
        val memoryUsage: Int? = null,
        @JsonProperty("cpuUsage")
        val cpuUsage: Int? = null
    )

    data class Chunk(
        @JsonIgnoreProperties(ignoreUnknown = true)
        @JsonProperty("filePath")
        val filePath: String? = null,
        @JsonProperty("content")
        val content: String? = null,
        @JsonProperty("id")
        val id: String? = null,
        @JsonProperty("index")
        val index: String? = null,
        @JsonProperty("vec")
        val vec: List<String>? = null,
        @JsonProperty("context")
        val context: String? = null,
        @JsonProperty("prev")
        val prev: String? = null,
        @JsonProperty("next")
        val next: String? = null,
        @JsonProperty("relativePath")
        val relativePath: String? = null,
        @JsonProperty("programmingLanguage")
        val programmingLanguage: String? = null,
    )

    private fun initAndIndex() {
        scope.launch {
            while (retryCount.get() < 5) {
                try {
                    logger.info { "project context: about to init key" }
                    val isInitSuccess = initEncryption()
                    if (isInitSuccess) {
                        logger.info { "project context index starting" }
                        delay(300)
                        val isIndexSuccess = index()
                        if (isIndexSuccess) isIndexComplete.set(true)
                        return@launch
                    }
                } catch (e: Exception) {
                    if (e.stackTraceToString().contains("Connection refused")) {
                        retryCount.incrementAndGet()
                        delay(10000)
                    } else {
                        return@launch
                    }
                }
            }
        }
    }

    private fun initEncryption(): Boolean {
        logger.info { "project context: init key for ${project.guessProjectDir()} on port ${encoderServer.port}" }
        val url = URL("http://localhost:${encoderServer.port}/initialize")
        val payload = encoderServer.getEncryptionRequest()
        val connection = url.openConnection() as HttpURLConnection
        setConnectionProperties(connection)
        setConnectionRequest(connection, payload)
        logger.info { "project context initialize response code: ${connection.responseCode} for ${project.name}" }
        return connection.responseCode == 200
    }

    fun index(): Boolean {
        logger.info { "project context: indexing ${project.name} on port ${encoderServer.port}" }
        val indexStartTime = System.currentTimeMillis()
        val url = URL("http://localhost:${encoderServer.port}/indexFiles")
        val filesResult = collectFiles()
        var duration = (System.currentTimeMillis() - indexStartTime).toDouble()
        logger.debug { "project context file collection time: ${duration}ms" }
        logger.debug { "list of files collected: ${filesResult.files.joinToString("\n")}" }
        val projectRoot = project.guessProjectDir()?.path ?: return false
        val payload = IndexRequestPayload(filesResult.files, projectRoot, false)
        val payloadJson = mapper.writeValueAsString(payload)
        val encrypted = encoderServer.encrypt(payloadJson)

        val connection = url.openConnection() as HttpURLConnection
        setConnectionProperties(connection)
        setConnectionRequest(connection, encrypted)
        logger.info { "project context index response code: ${connection.responseCode} for ${project.name}" }
        duration = (System.currentTimeMillis() - indexStartTime).toDouble()
        val startUrl = getStartUrl(project)
        logger.debug { "project context index time: ${duration}ms" }
        if (connection.responseCode == 200) {
            val usage = getUsage()
            TelemetryHelper.recordIndexWorkspace(duration, filesResult.files.size, filesResult.fileSize, true, usage?.memoryUsage, usage?.cpuUsage, startUrl)
            logger.debug { "project context index finished for ${project.name}" }
            return true
        } else {
            TelemetryHelper.recordIndexWorkspace(duration, filesResult.files.size, filesResult.fileSize, false, null, null, startUrl)
            return false
        }
    }

    fun query(prompt: String): List<RelevantDocument> {
        logger.info { "project context: querying ${project.name} on port ${encoderServer.port}" }
        val url = URL("http://localhost:${encoderServer.port}/query")
        val payload = QueryRequestPayload(prompt)
        val payloadJson = mapper.writeValueAsString(payload)
        val encrypted = encoderServer.encrypt(payloadJson)

        val connection = url.openConnection() as HttpURLConnection
        setConnectionProperties(connection)
        setConnectionTimeout(connection)
        setConnectionRequest(connection, encrypted)

        val responseCode = connection.responseCode
        logger.info { "project context query response code: $responseCode for $prompt" }
        val responseBody = if (responseCode == 200) {
            connection.inputStream.bufferedReader().use { reader -> reader.readText() }
        } else {
            ""
        }
        connection.disconnect()
        try {
            val parsedResponse = mapper.readValue<List<Chunk>>(responseBody)
            return queryResultToRelevantDocuments(parsedResponse)
        } catch (e: Exception) {
            logger.warn { "error parsing query response ${e.message}" }
            return emptyList()
        }
    }

    private fun getUsage(): Usage? {
        logger.info { "project context: getting usage for ${project.name} on port ${encoderServer.port}" }
        val url = URL("http://localhost:${encoderServer.port}/getUsage")
        val connection = url.openConnection() as HttpURLConnection
        setConnectionProperties(connection)
        val responseCode = connection.responseCode

        logger.info { "project context getUsage response code: $responseCode for ${project.name} " }
        val responseBody = if (responseCode == 200) {
            connection.inputStream.bufferedReader().use { reader -> reader.readText() }
        } else {
            ""
        }
        connection.disconnect()
        try {
            val parsedResponse = mapper.readValue<Usage>(responseBody)
            return parsedResponse
        } catch (e: Exception) {
            logger.warn { "error parsing query response ${e.message}" }
            return null
        }
    }

    fun updateIndex(filePath: String) {
        if (!isIndexComplete.get()) return
        logger.info { "project context: updating index for $filePath on port ${encoderServer.port}" }
        val url = URL("http://localhost:${encoderServer.port}/updateIndex")
        val payload = UpdateIndexRequestPayload(filePath)
        val payloadJson = mapper.writeValueAsString(payload)
        val encrypted = encoderServer.encrypt(payloadJson)
        with(url.openConnection() as HttpURLConnection) {
            setConnectionProperties(this)
            setConnectionTimeout(this)
            setConnectionRequest(this, encrypted)
            val responseCode = responseCode
            logger.debug { "project context update index response code: $responseCode for $filePath" }
            return
        }
    }

    private fun setConnectionTimeout(connection: HttpURLConnection) {
        connection.connectTimeout = 5000 // 5 seconds
        connection.readTimeout = 5000 // 5 second
    }

    private fun setConnectionProperties(connection: HttpURLConnection) {
        connection.requestMethod = "POST"
        connection.setRequestProperty("Content-Type", "text/plain")
        connection.setRequestProperty("Accept", "text/plain")
    }

    private fun setConnectionRequest(connection: HttpURLConnection, payload: String) {
        connection.doOutput = true
        connection.outputStream.use { outputStream ->
            OutputStreamWriter(outputStream).use { writer ->
                writer.write(payload)
            }
        }
    }

    private fun willExceedPayloadLimit(currentTotalFileSize: Long, currentFileSize: Long): Boolean {
        val maxSize = CodeWhispererSettings.getInstance().getProjectContextIndexMaxSize()
        return currentTotalFileSize.let { totalSize -> totalSize > (maxSize * 1024 * 1024 - currentFileSize) }
    }

    private fun isBuildOrBin(fileName: String): Boolean {
        val regex = Regex("""bin|build|node_modules|venv|\.venv|env|\.idea|\.conda""", RegexOption.IGNORE_CASE)
        return regex.find(fileName) != null
    }

    private fun collectFiles(): FileCollectionResult {
        val collectedFiles = mutableListOf<String>()
        var currentTotalFileSize = 0L
        val featureDevSessionContext = FeatureDevSessionContext(project)
        val allFiles = mutableListOf<VirtualFile>()
        project.guessProjectDir()?.let {
            VfsUtilCore.visitChildrenRecursively(
                it,
                object : VirtualFileVisitor<Unit>(NO_FOLLOW_SYMLINKS) {
                    // TODO: refactor this along with /dev & codescan file traversing logic
                    override fun visitFile(file: VirtualFile): Boolean {
                        if ((file.isDirectory && isBuildOrBin(file.name)) ||
                            runBlocking { featureDevSessionContext.ignoreFile(file.name, scope) } ||
                            (file.isFile && file.length > 10 * 1024 * 1024)
                        ) {
                            return false
                        }
                        if (file.isFile) {
                            allFiles.add(file)
                            return false
                        }
                        return true
                    }
                }
            )
        }

        for (file in allFiles) {
            if (willExceedPayloadLimit(currentTotalFileSize, file.length)) {
                break
            }
            collectedFiles.add(file.path)
            currentTotalFileSize += file.length
        }

        return FileCollectionResult(
            files = collectedFiles.toList(),
            fileSize = (currentTotalFileSize / 1024 / 1024).toInt()
        )
    }

    private fun queryResultToRelevantDocuments(queryResult: List<Chunk>): List<RelevantDocument> {
        val documents: MutableList<RelevantDocument> = mutableListOf()
        queryResult.forEach { chunk ->
            run {
                val path = chunk.relativePath.orEmpty()
                val text = chunk.context ?: chunk.content.orEmpty()
                val document = RelevantDocument(path, text.take(10240))
                documents.add(document)
                logger.info { "project context: query retrieved document $path with content: ${text.take(200)}" }
            }
        }
        return documents
    }

    override fun dispose() {
        retryCount.set(0)
    }

    companion object {
        private val logger = getLogger<ProjectContextProvider>()
    }
}
