// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.go

import com.goide.dlv.DlvDebugProcess
import com.goide.dlv.DlvDisconnectOption
import com.goide.dlv.DlvRemoteVmConnection
import com.goide.execution.GoRunUtil
import com.intellij.execution.process.ProcessAdapter
import com.intellij.execution.process.ProcessEvent
import com.intellij.openapi.application.runReadAction
import com.intellij.openapi.project.Project
import com.intellij.openapi.roots.ProjectFileIndex
import com.intellij.openapi.util.Key
import com.intellij.openapi.util.registry.Registry
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.xdebugger.XDebugProcess
import com.intellij.xdebugger.XDebugProcessStarter
import com.intellij.xdebugger.XDebugSession
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import software.aws.toolkits.jetbrains.core.coroutines.projectCoroutineScope
import software.aws.toolkits.jetbrains.services.lambda.sam.SamExecutable
import software.aws.toolkits.jetbrains.services.lambda.steps.SamRunnerStep
import software.aws.toolkits.jetbrains.utils.execution.steps.Context
import java.net.InetSocketAddress
import java.nio.file.Files
import java.util.concurrent.atomic.AtomicBoolean

/**
 * "Light" ides like Goland do not rely on marking folders as source root, so infer it based on
 * the go.mod file. This function is based off of the similar PackageJsonUtil#findUpPackageJson
 *
 * @throws IllegalStateException If the contentRoot cannot be located
 */
fun inferSourceRoot(project: Project, virtualFile: VirtualFile): VirtualFile? {
    val projectFileIndex = ProjectFileIndex.getInstance(project)
    val contentRoot = runReadAction {
        projectFileIndex.getContentRootForFile(virtualFile)
    }

    return contentRoot?.let { root ->
        var file = virtualFile.parent
        while (file != null) {
            if ((file.isDirectory && file.children.any { !it.isDirectory && it.name == "go.mod" })) {
                return file
            }
            // If we go up to the root and it's still not found, stop going up and mark source root as
            // not found, since it will fail to build
            if (file == root) {
                return null
            }
            file = file.parent
        }
        return null
    }
}

object GoDebugHelper {
    // TODO see https://youtrack.jetbrains.com/issue/GO-10775 for "Debugger disconnected unexpectedly" when the lambda finishes
    suspend fun createGoDebugProcess(
        debugHost: String,
        debugPorts: List<Int>,
        context: Context
    ): XDebugProcessStarter = object : XDebugProcessStarter() {
        override fun start(session: XDebugSession): XDebugProcess {
            val process = DlvDebugProcess(session, DlvRemoteVmConnection(DlvDisconnectOption.KILL), null, true)

            val processHandler = process.processHandler
            val socketAddress = InetSocketAddress(debugHost, debugPorts.first())

            val scope = projectCoroutineScope(session.project)
            processHandler.addProcessListener(
                object : ProcessAdapter() {
                    override fun startNotified(event: ProcessEvent) {
                        scope.launch {
                            val samProcessHandler = context.pollingGet(SamRunnerStep.SAM_PROCESS_HANDLER)
                            val debuggerConnector = object : ProcessAdapter() {
                                val connected = AtomicBoolean(false)

                                // If we don't wait, then then debugger will try to attach to
                                // the container before it starts Devle. So, we have to poll output
                                // See https://youtrack.jetbrains.com/issue/GO-10279
                                // TODO revisit this to see if higher IDE versions help FIX_WHEN_MIN_IS_211 (?)
                                override fun onTextAvailable(event: ProcessEvent, outputType: Key<*>) {
                                    if (event.text.contains(SamExecutable.goStartMessage) && !connected.getAndSet(true)) {
                                        process.connect(socketAddress)
                                    }
                                }
                            }
                            samProcessHandler.addProcessListener(debuggerConnector)
                            delay(Registry.intValue("aws.sam.goMaxAttachDelay", 60000).toLong())
                            // attach anyway if we never get the correct output and the process hasn't terminated
                            val hasConnected = debuggerConnector.connected.getAndSet(true)
                            if (!hasConnected && !samProcessHandler.isProcessTerminated) {
                                process.connect(socketAddress)
                            }
                        }
                    }
                }
            )
            return process
        }
    }

    fun copyDlv(): String {
        // This can take a target platform, but that pulls directly from GOOS, so we have to walk back up the file tree
        // either way. Goland comes with mac/window/linux dlv since it supports remote debugging, so it is always safe to
        // pull the linux one
        val dlvFolder = GoRunUtil.getBundledDlv(null)?.parentFile?.parentFile?.resolve("linux")
            ?: throw IllegalStateException("Packaged Devle debugger is not found!")
        val directory = Files.createTempDirectory("goDebugger")
        Files.copy(dlvFolder.resolve("dlv").toPath(), directory.resolve("dlv"))
        // Delve that comes packaged with the IDE does not have the executable flag set
        directory.resolve("dlv").toFile().setExecutable(true)
        return directory.toAbsolutePath().toString()
    }
}
