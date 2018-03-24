package software.aws.toolkits.jetbrains.services.lambda

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.module.Module
import com.intellij.openapi.project.rootManager
import com.intellij.openapi.vfs.VfsUtilCore
import com.intellij.psi.PsiElement
import com.intellij.psi.PsiFile
import com.jetbrains.extensions.getSdk
import com.jetbrains.python.PyTokenTypes
import com.jetbrains.python.psi.PyFile
import com.jetbrains.python.psi.PyFunction
import com.jetbrains.python.sdk.PythonSdkType
import software.amazon.awssdk.services.lambda.model.Runtime
import software.aws.toolkits.core.utils.createTemporaryZipFile
import software.aws.toolkits.core.utils.putNextEntry
import software.aws.toolkits.jetbrains.services.lambda.upload.LambdaLineMarker
import software.aws.toolkits.jetbrains.utils.filesystem.walkFiles
import java.nio.file.Path
import java.util.concurrent.CompletableFuture
import java.util.concurrent.CompletionStage

class PythonLambdaLineMarker : LambdaLineMarker() {
    override fun getHandlerName(element: PsiElement): String? {
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

class PythonLambdaPackager : LambdaPackager {
    override fun createPackage(module: Module, file: PsiFile): CompletionStage<Path> {
        val future = CompletableFuture<Path>()
        ApplicationManager.getApplication().executeOnPooledThread {
            val virtualFile = file.virtualFile
            val contentRoot = module.rootManager.contentRoots.find { VfsUtilCore.isAncestor(it, virtualFile, true) }
            if (contentRoot == null) {
                future.completeExceptionally(RuntimeException("Unable to determine content root for $file"))
                return@executeOnPooledThread
            }
            try {
                val excludedRoots = module.rootManager.excludeRoots.toSet()
                val packagedFile = createTemporaryZipFile { zip ->
                    contentRoot.walkFiles(excludedRoots) { file ->
                        file.inputStream.use { fileContents ->
                            zip.putNextEntry(VfsUtilCore.getRelativeLocation(file, contentRoot)!!, fileContents)
                        }
                    }
                }
                future.complete(packagedFile)
            } catch (e: Exception) {
                future.completeExceptionally(e)
            }
        }

        return future
    }

    override fun determineRuntime(module: Module, file: PsiFile): Runtime = if (PythonSdkType.getLanguageLevelForSdk(module.getSdk()).isPy3K) {
        Runtime.PYTHON3_6
    } else {
        Runtime.PYTHON2_7
    }
}