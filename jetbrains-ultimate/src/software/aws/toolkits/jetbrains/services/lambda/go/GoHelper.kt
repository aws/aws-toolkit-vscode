// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.go

import com.intellij.execution.process.ProcessAdapter
import com.intellij.execution.process.ProcessEvent
import com.intellij.execution.runners.ExecutionEnvironment
import com.intellij.openapi.project.Project
import com.intellij.openapi.roots.ProjectFileIndex
import com.intellij.openapi.util.registry.Registry
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.xdebugger.XDebugProcess
import com.intellij.xdebugger.XDebugProcessStarter
import com.intellij.xdebugger.XDebugSession
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import software.aws.toolkits.jetbrains.services.lambda.execution.sam.SamRunningState
import software.aws.toolkits.jetbrains.utils.ApplicationThreadPoolScope
import java.net.InetSocketAddress
import java.nio.file.Files

/**
 * "Light" ides like Goland do not rely on marking folders as source root, so infer it based on
 * the go.mod file. This function is based off of the similar PackageJsonUtil#findUpPackageJson
 *
 * @throws IllegalStateException If the contentRoot cannot be located
 */
fun inferSourceRoot(project: Project, virtualFile: VirtualFile): VirtualFile? {
    val projectFileIndex = ProjectFileIndex.getInstance(project)
    return projectFileIndex.getContentRootForFile(virtualFile)?.let { root ->
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

suspend fun createGoDebugProcess(
    environment: ExecutionEnvironment,
    state: SamRunningState,
    debugHost: String,
    debugPorts: List<Int>
): XDebugProcessStarter {
    val executionResult = state.execute(environment.executor, environment.runner)

    return object : XDebugProcessStarter() {
        override fun start(session: XDebugSession): XDebugProcess {
            val process = createDelveDebugProcess(session, executionResult)

            val processHandler = executionResult.processHandler
            val socketAddress = InetSocketAddress(debugHost, debugPorts.first())

            if (processHandler == null || processHandler.isStartNotified) {
                // this branch should never actually be hit because it gets here too fast
                process.connect(socketAddress)
            } else {
                processHandler.addProcessListener(
                    object : ProcessAdapter() {
                        override fun startNotified(event: ProcessEvent) {
                            ApplicationThreadPoolScope("GoSamDebugAttacher").launch {
                                // If we don't wait, then then debugger will try to attach to
                                // the container before it starts Devle. So, we have to add a sleep.
                                // Delve takes quite a while to start in the sam cli images hence long sleep
                                // See https://youtrack.jetbrains.com/issue/GO-10279
                                // TODO revisit this to see if higher IDE versions help FIX_WHEN_MIN_IS_211 (?)
                                delay(Registry.intValue("aws.sam.goDebuggerDelay", 5000).toLong())
                                process.connect(socketAddress)
                            }
                        }
                    }
                )
            }
            return process
        }
    }
}

fun copyDlv(): String {
    val dlvFolder = getDelve()
    val directory = Files.createTempDirectory("goDebugger")
    Files.copy(dlvFolder.resolve("dlv").toPath(), directory.resolve("dlv"))
    // Delve that comes packaged with the IDE does not have the executable flag set
    directory.resolve("dlv").toFile().setExecutable(true)
    return directory.toAbsolutePath().toString()
}
