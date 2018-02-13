package software.aws.toolkits.jetbrains.ultimate.services.lambda

import com.goide.GoConstants
import com.goide.GoTypes
import com.goide.psi.GoFile
import com.goide.psi.GoFunctionDeclaration
import com.goide.runconfig.GoRunUtil
import com.goide.util.GoExecutor
import com.intellij.execution.process.ProcessAdapter
import com.intellij.execution.process.ProcessEvent
import com.intellij.openapi.module.Module
import com.intellij.openapi.progress.ProgressIndicator
import com.intellij.openapi.util.text.StringUtil
import com.intellij.psi.PsiElement
import com.intellij.psi.PsiFile
import com.intellij.util.EmptyConsumer
import com.intellij.util.io.inputStream
import com.intellij.util.io.outputStream
import org.apache.commons.compress.archivers.ArchiveStreamFactory
import org.apache.commons.compress.archivers.zip.ZipArchiveEntry
import software.amazon.awssdk.services.lambda.model.Runtime
import software.aws.toolkits.jetbrains.services.lambda.LambdaPackager
import software.aws.toolkits.jetbrains.services.lambda.upload.LambdaLineMarker
import software.aws.toolkits.jetbrains.utils.notifyError
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.Paths

const val AWS_GO_LAMBDA_IMPORT = "github.com/aws/aws-lambda-go/lambda"

class GoLambdaLineMarker : LambdaLineMarker() {
    override fun getHandlerName(element: PsiElement): String? {
        if (element.node?.elementType != GoTypes.IDENTIFIER) {
            return null
        }
        val parent = element.parent as? GoFunctionDeclaration ?: return null
        val goFile = element.containingFile as? GoFile ?: return null

        if (GoConstants.MAIN == parent.name
            && GoRunUtil.isMainGoFile(goFile)
            && hasLambdaImport(goFile)
        ) {
            return StringUtil.trimEnd(goFile.name, ".go")
        }
        return null
    }

    private fun hasLambdaImport(goFile: GoFile) = goFile.imports.any {
        it.path == AWS_GO_LAMBDA_IMPORT
    }
}

class GoLambdaPackager : LambdaPackager {
    override fun createPackage(module: Module, file: PsiFile, onComplete: (Path) -> Unit) {
        val workingDir = Paths.get(file.containingFile.virtualFile.parent.canonicalPath)
        if (!Files.isDirectory(workingDir)) {
            notifyError("Could not locate parent directory of ${file.name}", module.project)
            return
        }

        val tempFile = Files.createTempDirectory("aws-go-lambda").resolve(StringUtil.trimEnd(file.name, ".go"))

        GoExecutor.`in`(module)
            .withWorkDirectory(workingDir.toString())
            .withExtraEnvironment(mapOf("GOOS" to "linux", "GOARCH" to "amd64"))
            .withPresentableName("Compiling Go Lambda")
            .showNotifications(true, false)
            .disablePty()
            .withParameters("build")
            .withParameters("-o", tempFile.toString())
            .withParameters(".")
            .withProcessListener(object : ProcessAdapter() {
                override fun processTerminated(event: ProcessEvent) {
                    super.processTerminated(event);
                    if (event.exitCode == 0) {
                        createZip(tempFile, onComplete)
                    }
                }
            }).executeWithProgress(
            true, true, EmptyConsumer.getInstance<ProgressIndicator>(),
            EmptyConsumer.getInstance<Boolean>() // TODO: Put this in our own log tab...not Run's
        )
    }

    private fun createZip(compiledOutput: Path, onComplete: (Path) -> Unit) {
        val tempZip = Files.createTempFile(null, ".zip")
        tempZip.outputStream().use {
            val archive = ArchiveStreamFactory().createArchiveOutputStream(ArchiveStreamFactory.ZIP, it)

            ZipArchiveEntry(compiledOutput.toFile(), compiledOutput.fileName.toString()).let {
                it.unixMode = 755 // Make sure the go executable is marked as executable
                archive.putArchiveEntry(it)
                compiledOutput.inputStream().use {
                    it.copyTo(archive)
                }
                archive.closeArchiveEntry()
            }
            archive.finish()
        }

        onComplete(tempZip)
    }

    // TODO change to GO, v2 needs to do a model update
    override fun determineRuntime(module: Module, file: PsiFile): Runtime = Runtime.JAVA8
}