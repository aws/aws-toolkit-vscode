package software.aws.toolkits.jetbrains.aws.lambda

import com.amazonaws.services.lambda.model.CreateFunctionRequest
import com.amazonaws.services.lambda.model.FunctionCode
import com.amazonaws.services.lambda.model.Runtime
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.compiler.CompilerManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.roots.OrderRootType
import com.intellij.openapi.roots.libraries.LibraryTablesRegistrar
import com.intellij.openapi.vfs.VfsUtil
import com.intellij.openapi.vfs.VirtualFile
import software.aws.toolkits.jetbrains.aws.AwsResourceBundle
import software.aws.toolkits.jetbrains.aws.LambdaClientProvider
import software.aws.toolkits.jetbrains.aws.S3ClientProvider
import java.io.File
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.Paths
import java.util.stream.Collectors
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream

object LambdaCreatorFactory {
    fun create(awsResourceBundle: AwsResourceBundle):LambdaCreator {
        return LambdaCreator(LambdaPackager(), CodeUploader(awsResourceBundle), LambdaFunctionCreator(awsResourceBundle))
    }
}

class LambdaCreator(private val packager: LambdaPackager, private val uploader: CodeUploader, private val functionCreator: LambdaFunctionCreator) {
    fun createLambda(functionDetails: LambdaFunction, project: Project, onComplete: (String) -> Unit) {
        packager.doPackaging(project) {
            uploader.upload(functionDetails, it) {
                key, version -> functionCreator.create(functionDetails, key, version, onComplete)
            }
        }
    }
}

class LambdaFunctionCreator(private val lambdaClientProvider: LambdaClientProvider) {
    fun create(details: LambdaFunction, codeObjectKey: String, codeObjectVersion: String?, onComplete: (String) -> Unit) {
        ApplicationManager.getApplication().executeOnPooledThread {
            val code = FunctionCode().withS3Bucket(details.s3Bucket.name).withS3Key(codeObjectKey)
            if (codeObjectVersion != null) {
                code.withS3ObjectVersion(codeObjectVersion)
            }
            val req = CreateFunctionRequest()
                    .withHandler(details.handler)
                    .withFunctionName(details.name)
                    .withRole(details.iamRole.arn)
                    .withRuntime(Runtime.Java8)
                    .withCode(code)
            val result = lambdaClientProvider.lambdaClient().createFunction(req)
            onComplete(result.functionArn)
        }
    }
}

class CodeUploader(private val s3ClientProvider: S3ClientProvider) {
    fun upload(functionDetails: LambdaFunction, code: Path, onComplete: (String, String?) -> Unit) {
        ApplicationManager.getApplication().executeOnPooledThread {
            val key = "${functionDetails.name}.zip"
            val result = s3ClientProvider.s3Client().putObject(functionDetails.s3Bucket.name, key, code.toFile())
            onComplete(key, result.versionId)
        }
    }
}

class LambdaPackager {
    fun doPackaging(project: Project, onComplete: (Path) -> Unit) {
        CompilerManager.getInstance(project).rebuild { aborted, errors, warnings, compileContext ->
            if (!aborted && errors == 0) {
                val classes = compileContext.projectCompileScope.affectedModules
                        .map { compileContext.getModuleOutputDirectory(it) }
                        .flatMap {
                            val outputDir = it?.toPath()
                            Files.walk(outputDir)
                                    .filter { it.toString().toLowerCase().endsWith(".class") }
                                    .map { Pair(outputDir?.relativize(it), it) }.collect(Collectors.toList<Pair<Path?, Path>>())
                        }.filterNotNull()

                val dependencies = LibraryTablesRegistrar.getInstance().getLibraryTable(project).libraries
                        .flatMap { it.getFiles(OrderRootType.CLASSES).toList() }
                        .map { VfsUtil.getVirtualFileForJar(it) }
                        .map { it?.toPath() }.filterNotNull()

                val zipFile = Files.createTempFile("function", ".zip")
                val zip = ZipOutputStream(Files.newOutputStream(zipFile))

                dependencies.forEach { addEntry("lib/${it.fileName}", it, zip) }
                classes.forEach { addEntry(it.first.toString(), it.second, zip) }

                zip.close()
                onComplete(zipFile)
            }
        }
    }

    private fun addEntry(entryName: String, file: Path, zip: ZipOutputStream) {
        zip.putNextEntry(ZipEntry(entryName))
        val bytes = Files.readAllBytes(file)
        zip.write(bytes, 0, bytes.size)
        zip.closeEntry()
    }

    private fun VirtualFile.toPath(): Path {
        return Paths.get(File(this.path).toURI())
    }
}