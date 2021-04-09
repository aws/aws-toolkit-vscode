// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.gradle.jacoco

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

            val jacocoServer = task.project.gradle.sharedServices.registerIfAbsent("jacocoServer", JacocoServer::class.java) {
                if (!execFile.exists()) {
                    task.project.mkdir(execFile.parentFile)
                    execFile.createNewFile()
                }

                parameters.execFile.set(execFile)
            }

            task.doFirst {
                jacocoServer.get().start()
            }
        } ?: task.logger.warn("$task does not have Jacoco enabled on it")
    }

    abstract class JacocoServer : BuildService<JacocoServer.Params>, AutoCloseable {
        interface Params : BuildServiceParameters {
            val execFile: RegularFileProperty
        }

        private val serverSocket = ServerSocket(DEFAULT_JACOCO_PORT)
        private val signalShutdown = AtomicBoolean(false)

        private val outputStream = parameters.execFile.asFile.get().outputStream()
        private val fileWriter = ExecutionDataWriter(outputStream)
        private val serverThread = Thread {
            while (!signalShutdown.get()) {
                val clientSocket = serverSocket.accept()
                JacocoHandler(clientSocket, fileWriter).start()
            }
        }

        fun start() {
            serverThread.start()
        }

        override fun close() {
            signalShutdown.set(true)
            serverThread.interrupt()

            outputStream.close()
        }
    }

    private class JacocoHandler(private val socket: Socket, private val fileWriter: ExecutionDataWriter) : Thread(), ISessionInfoVisitor,
        IExecutionDataVisitor {

        override fun run() {
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
