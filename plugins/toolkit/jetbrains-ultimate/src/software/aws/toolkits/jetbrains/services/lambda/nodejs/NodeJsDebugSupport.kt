// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.nodejs

import com.google.common.collect.BiMap
import com.google.common.collect.HashBiMap
import com.intellij.execution.process.ProcessAdapter
import com.intellij.execution.process.ProcessEvent
import com.intellij.execution.runners.ExecutionEnvironment
import com.intellij.javascript.debugger.LocalFileSystemFileFinder
import com.intellij.javascript.debugger.RemoteDebuggingFileFinder
import com.intellij.lang.javascript.JavascriptLanguage
import com.intellij.openapi.util.io.FileUtil
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.xdebugger.XDebugProcess
import com.intellij.xdebugger.XDebugProcessStarter
import com.intellij.xdebugger.XDebugSession
import com.jetbrains.debugger.wip.WipLocalVmConnection
import com.jetbrains.nodeJs.NodeChromeDebugProcess
import org.jetbrains.io.LocalFileFinder
import software.aws.toolkits.core.lambda.LambdaRuntime
import software.aws.toolkits.jetbrains.services.PathMapping
import software.aws.toolkits.jetbrains.services.lambda.execution.sam.ImageDebugSupport
import software.aws.toolkits.jetbrains.services.lambda.execution.sam.RuntimeDebugSupport
import software.aws.toolkits.jetbrains.services.lambda.execution.sam.SamRunningState
import software.aws.toolkits.jetbrains.utils.execution.steps.Context
import java.net.InetSocketAddress

class NodeJsRuntimeDebugSupport : RuntimeDebugSupport {
    override suspend fun createDebugProcess(
        context: Context,
        environment: ExecutionEnvironment,
        state: SamRunningState,
        debugHost: String,
        debugPorts: List<Int>
    ): XDebugProcessStarter = NodeJsDebugUtils.createDebugProcess(state, debugHost, debugPorts)
}

abstract class NodeJsImageDebugSupport : ImageDebugSupport {
    override fun supportsPathMappings(): Boolean = true
    override val languageId = JavascriptLanguage.INSTANCE.id
    override suspend fun createDebugProcess(
        context: Context,
        environment: ExecutionEnvironment,
        state: SamRunningState,
        debugHost: String,
        debugPorts: List<Int>
    ): XDebugProcessStarter = NodeJsDebugUtils.createDebugProcess(state, debugHost, debugPorts)

    override fun containerEnvVars(debugPorts: List<Int>): Map<String, String> = mapOf(
        "NODE_OPTIONS" to "--inspect-brk=0.0.0.0:${debugPorts.first()} --max-http-header-size 81920"
    )
}

class NodeJs16ImageDebug : NodeJsImageDebugSupport() {
    override val id: String = LambdaRuntime.NODEJS16_X.toString()
    override fun displayName() = LambdaRuntime.NODEJS16_X.toString().capitalize()
}

class NodeJs18ImageDebug : NodeJsImageDebugSupport() {
    override val id: String = LambdaRuntime.NODEJS18_X.toString()
    override fun displayName() = LambdaRuntime.NODEJS18_X.toString().capitalize()
}

class NodeJs20ImageDebug : NodeJsImageDebugSupport() {
    override val id: String = LambdaRuntime.NODEJS20_X.toString()
    override fun displayName() = LambdaRuntime.NODEJS20_X.toString().capitalize()
}

object NodeJsDebugUtils {
    private const val NODE_MODULES = "node_modules"

    fun createDebugProcess(
        state: SamRunningState,
        debugHost: String,
        debugPorts: List<Int>
    ): XDebugProcessStarter = object : XDebugProcessStarter() {
        override fun start(session: XDebugSession): XDebugProcess {
            val mappings = createBiMapMappings(state.pathMappings)
            val fileFinder = RemoteDebuggingFileFinder(mappings, LocalFileSystemFileFinder())

            val connection = WipLocalVmConnection()

            val process = NodeChromeDebugProcess(session, fileFinder, connection, null)

            val processHandler = process.processHandler
            val socketAddress = InetSocketAddress(debugHost, debugPorts.first())

            if (processHandler.isStartNotified) {
                connection.open(socketAddress)
            } else {
                processHandler.addProcessListener(
                    object : ProcessAdapter() {
                        override fun startNotified(event: ProcessEvent) {
                            connection.open(socketAddress)
                        }
                    }
                )
            }

            return process
        }
    }

    /**
     * Convert [PathMapping] to NodeJs debugger path mapping format.
     *
     * Docker uses the same project structure for dependencies in the folder node_modules. We map the source code and
     * the dependencies in node_modules folder separately as the node_modules might not exist in the local project.
     */
    private fun createBiMapMappings(pathMapping: List<PathMapping>): BiMap<String, VirtualFile> {
        val mappings = HashBiMap.create<String, VirtualFile>(pathMapping.size)

        listOf(".", NODE_MODULES).forEach { subPath ->
            pathMapping.forEach {
                val remotePath = FileUtil.toCanonicalPath("${it.remoteRoot}/$subPath")
                LocalFileFinder.findFile("${it.localRoot}/$subPath")?.let { localFile ->
                    mappings.putIfAbsent("file://$remotePath", localFile)
                }
            }
        }

        return mappings
    }
}
