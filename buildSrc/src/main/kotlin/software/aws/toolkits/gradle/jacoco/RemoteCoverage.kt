// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.gradle.jacoco

import org.gradle.BuildAdapter
import org.gradle.BuildResult
import org.gradle.api.file.RegularFileProperty
import org.gradle.api.services.BuildService
import org.gradle.api.services.BuildServiceParameters
import org.gradle.api.tasks.testing.Test
import org.gradle.testing.jacoco.plugins.JacocoTaskExtension
import org.jacoco.core.data.ExecutionData
import org.jacoco.core.data.ExecutionDataWriter
import org.jacoco.core.data.IExecutionDataVisitor
import org.jacoco.core.data.ISessionInfoVisitor
import org.jacoco.core.data.SessionInfo
import org.jacoco.core.runtime.RemoteControlReader
import org.jacoco.core.runtime.RemoteControlWriter
import java.io.FileOutputStream
import java.net.ServerSocket
import java.net.Socket
import java.util.concurrent.atomic.AtomicBoolean

class RemoteCoverage private constructor(task: Test) {
    companion object {
        fun enableRemoteCoverage(task: Test) = RemoteCoverage(task)

        private const val DEFAULT_JACOCO_PORT = 6300
    }

    init {
        task.extensions.findByType(JacocoTaskExtension::class.java)?.let {
            val execFile = it.destinationFile ?: return@let

            // Use a shared service since it does not block task execution
            val jacocoServer = task.project.gradle.sharedServices.registerIfAbsent("jacocoServer", JacocoServer::class.java) {
                if (!execFile.exists()) {
                    task.project.mkdir(execFile.parentFile)
                    execFile.createNewFile()
                }

                parameters.execFile.set(execFile)
            }

            task.doFirst {
                jacocoServer.get().start()
                task.project.gradle.addBuildListener(object : BuildAdapter() {
                    override fun buildFinished(result: BuildResult) {
                        task.project.gradle.removeListener(this)
                        runCatching {
                            jacocoServer.get().close()
                        }
                    }
                })
            }
        } ?: task.logger.warn("$task does not have Jacoco enabled on it")
    }

    abstract class JacocoServer : BuildService<JacocoServer.Params>, AutoCloseable {
        interface Params : BuildServiceParameters {
            val execFile: RegularFileProperty
        }

        private val serverSocket = ServerSocket(DEFAULT_JACOCO_PORT)
        private val isRunning = AtomicBoolean(false)

        private val serverRunnable = Runnable {
            parameters.execFile.asFile.get().outputStream().use {
                while (isRunning.get()) {
                    val clientSocket = serverSocket.accept()
                    JacocoHandler(clientSocket, it).run()
                }
            }
        }
        private lateinit var serverThread: Thread

        fun start() {
            if (!isRunning.getAndSet(true)) {
                serverThread = Thread(serverRunnable)
                serverThread.start()
            } else {
                throw IllegalStateException("Jacoco server is already running!")
            }
        }

        override fun close() {
            if (isRunning.getAndSet(false)) {
                serverThread.interrupt()
            }
        }
    }

    private class JacocoHandler(private val socket: Socket, private val outputFile: FileOutputStream) : ISessionInfoVisitor, IExecutionDataVisitor {
        private val fileWriter = ExecutionDataWriter(outputFile)

        fun run() {
            socket.use {
                socket.getInputStream().use { input ->
                    socket.getOutputStream().use { output ->
                        val reader = RemoteControlReader(input)
                        reader.setSessionInfoVisitor(this)
                        reader.setExecutionDataVisitor(this)

                        RemoteControlWriter(output)

                        @Suppress("ControlFlowWithEmptyBody")
                        // Read all the data from jacoco
                        while (reader.read()) {
                        }
                        synchronized(fileWriter) { fileWriter.flush() }
                    }
                }
            }
        }

        override fun visitSessionInfo(info: SessionInfo) {
            synchronized(fileWriter) { fileWriter.visitSessionInfo(info) }
        }

        override fun visitClassExecution(data: ExecutionData) {
            synchronized(fileWriter) { fileWriter.visitClassExecution(data) }
        }
    }
}
