// Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda

import com.intellij.execution.configurations.GeneralCommandLine
import com.intellij.execution.runners.ExecutionEnvironment
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.module.Module
import com.intellij.openapi.module.ModuleManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.project.rootManager
import com.intellij.openapi.projectRoots.Sdk
import com.intellij.openapi.util.io.FileUtil
import com.intellij.openapi.vfs.VfsUtilCore
import com.intellij.psi.NavigatablePsiElement
import com.intellij.psi.PsiElement
import com.intellij.psi.PsiFile
import com.intellij.psi.search.GlobalSearchScope
import com.intellij.psi.util.QualifiedName
import com.intellij.util.AbstractPathMapper
import com.intellij.util.PathMappingSettings.PathMapping
import com.intellij.xdebugger.XDebugProcess
import com.intellij.xdebugger.XDebugProcessStarter
import com.intellij.xdebugger.XDebugSession
import com.intellij.xdebugger.XSourcePosition
import com.jetbrains.extensions.getSdk
import com.jetbrains.python.PyTokenTypes
import com.jetbrains.python.PythonHelper
import com.jetbrains.python.PythonLanguage
import com.jetbrains.python.debugger.PyDebugProcess
import com.jetbrains.python.debugger.PyLocalPositionConverter
import com.jetbrains.python.debugger.PySourcePosition
import com.jetbrains.python.psi.PyFile
import com.jetbrains.python.psi.PyFunction
import com.jetbrains.python.psi.PyPsiFacade
import com.jetbrains.python.psi.resolve.fromModule
import com.jetbrains.python.sdk.PythonSdkType
import software.amazon.awssdk.services.lambda.model.Runtime
import software.aws.toolkits.core.utils.createTemporaryZipFile
import software.aws.toolkits.core.utils.putNextEntry
import software.aws.toolkits.jetbrains.services.lambda.execution.sam.SamDebugSupport
import software.aws.toolkits.jetbrains.services.lambda.execution.sam.SamRunningState
import software.aws.toolkits.jetbrains.utils.filesystem.walkFiles
import java.util.concurrent.CompletableFuture
import java.util.concurrent.CompletionStage

class PythonRuntimeGroup : RuntimeGroupInformation {
    override val runtimes: Set<Runtime> = setOf(Runtime.PYTHON2_7, Runtime.PYTHON3_6)
    override val languageIds: Set<String> = setOf(PythonLanguage.INSTANCE.id)
    override val requiresCompilation: Boolean = false

    override fun runtimeForSdk(sdk: Sdk): Runtime? = when {
        sdk.sdkType is PythonSdkType && PythonSdkType.getLanguageLevelForSdk(sdk).isPy3K -> Runtime.PYTHON3_6
        sdk.sdkType is PythonSdkType && PythonSdkType.getLanguageLevelForSdk(sdk).isPython2 -> Runtime.PYTHON2_7
        else -> null
    }
}

class PythonLambdaPackager : LambdaPackager {
    override fun createPackage(module: Module, file: PsiFile): CompletionStage<LambdaPackage> {
        val future = CompletableFuture<LambdaPackage>()
        ApplicationManager.getApplication().executeOnPooledThread {
            val virtualFile = file.virtualFile
            val contentRoot = module.rootManager.contentRoots.find { VfsUtilCore.isAncestor(it, virtualFile, true) }
            if (contentRoot == null) {
                future.completeExceptionally(RuntimeException("Unable to determine content root for $file"))
                return@executeOnPooledThread
            }

            val mappings = mutableMapOf<String, String>()
            mappings[contentRoot.path] = "/"

            try {
                val excludedRoots = module.rootManager.excludeRoots.toSet()
                val packagedFile = createTemporaryZipFile { zip ->
                    contentRoot.walkFiles(excludedRoots) { file ->
                        file.inputStream.use { fileContents ->
                            zip.putNextEntry(VfsUtilCore.getRelativeLocation(file, contentRoot)!!, fileContents)
                        }
                    }
                }
                future.complete(LambdaPackage(packagedFile, mappings))
            } catch (e: Exception) {
                future.completeExceptionally(e)
            }
        }

        return future
    }

    override fun determineRuntime(module: Module, file: PsiFile): Runtime =
        if (PythonSdkType.getLanguageLevelForSdk(module.getSdk()).isPy3K) {
            Runtime.PYTHON3_6
        } else {
            Runtime.PYTHON2_7
        }
}

class PythonLambdaHandlerResolver : LambdaHandlerResolver {
    override fun findPsiElements(
        project: Project,
        handler: String,
        searchScope: GlobalSearchScope
    ): Array<NavigatablePsiElement> {
        val psiFacade = PyPsiFacade.getInstance(project)
        val lambdaModule = handler.substringBeforeLast(".")
        val function = handler.substringAfterLast(".")
        return ModuleManager.getInstance(project).modules.flatMap { module ->
            psiFacade.resolveQualifiedName(QualifiedName.fromDottedString(lambdaModule), fromModule(module))
                .filterIsInstance<PyFile>()
                .flatMap { pyFile ->
                    pyFile.children.filterIsInstance<NavigatablePsiElement>()
                        .filter { psiFunction -> psiFunction.name == function }
                }
        }.toTypedArray()
    }

    override fun determineHandler(element: PsiElement): String? {
        if (element.node?.elementType != PyTokenTypes.IDENTIFIER) {
            return null
        }
        val function = element.parent as? PyFunction ?: return null
        if (function.parent is PyFile && function.parameterList.parameters?.size == 2) {
            return function.qualifiedName
        }
        return null
    }
}

class PythonSamDebugSupport : SamDebugSupport {
    override fun patchCommandLine(debugPort: Int, state: SamRunningState, commandLine: GeneralCommandLine) {
        super.patchCommandLine(debugPort, state, commandLine)

        // Note: To debug pydevd, pass '--DEBUG'
        val debugArgs = "-u $DEBUGGER_VOLUME_PATH/pydevd.py --multiprocess --port $debugPort --file"

        commandLine.withParameters("--debugger-path")
            .withParameters(PythonHelper.DEBUGGER.pythonPathEntry) // Mount pydevd from PyCharm into docker
            .withParameters("--debug-args")
            .withParameters(debugArgs)
    }

    override fun createDebugProcess(
        environment: ExecutionEnvironment,
        state: SamRunningState,
        debugPort: Int
    ): XDebugProcessStarter? {
        return object : XDebugProcessStarter() {
            override fun start(session: XDebugSession): XDebugProcess {
                val executionResult = state.execute(environment.executor, environment.runner)
                return PyDebugProcess(
                    session,
                    executionResult.executionConsole,
                    executionResult.processHandler,
                    "localhost",
                    debugPort
                ).also {
                    it.positionConverter = PositionConverter().apply {
                        state.lambdaPackage.mappings.forEach { local, remote ->
                            addMapping(local, FileUtil.normalize("$TASK_PATH/$remote"))
                        }
                        addMapping(PythonHelper.DEBUGGER.pythonPathEntry, DEBUGGER_VOLUME_PATH)
                    }
                }
            }
        }
    }

    private companion object {
        const val TASK_PATH = "/var/task"
        const val DEBUGGER_VOLUME_PATH = "/tmp/lambci_debug_files"
    }

    /**
     * Converts the IDE's view of the world into the  Docker image's view allowing for breakpoints and frames to work
     */
    internal class PositionConverter : PyLocalPositionConverter() {
        private val pathMapper = PathMapper()

        fun addMapping(local: String, remote: String) {
            pathMapper.addMapping(local, remote)
        }

        override fun convertToPython(filePath: String, line: Int): PySourcePosition {
            val localSource = super.convertToPython(filePath, line)
            return PyRemoteSourcePosition(pathMapper.convertToRemote(localSource.file), localSource.line)
        }

        override fun convertFromPython(position: PySourcePosition, frameName: String?): XSourcePosition? {
            val localFile = pathMapper.convertToLocal(position.file)
            return createXSourcePosition(getVirtualFile(localFile), position.line)
        }
    }

    internal class PathMapper : AbstractPathMapper() {
        private val mappings = mutableListOf<PathMapping>()

        fun addMapping(local: String, remote: String) {
            mappings.add(PathMapping(local, remote))
        }

        override fun convertToLocal(remotePath: String): String {
            val localPath = AbstractPathMapper.convertToLocal(remotePath, mappings)
            return localPath ?: remotePath
        }

        override fun convertToRemote(localPath: String): String {
            val remotePath = AbstractPathMapper.convertToRemote(localPath, mappings)
            return remotePath ?: localPath
        }

        override fun isEmpty(): Boolean = mappings.isEmpty()
        override fun getAvailablePathMappings(): MutableCollection<PathMapping> = mappings
    }
}