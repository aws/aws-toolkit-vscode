package software.aws.toolkits.jetbrains.aws.lambda

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.compiler.CompilerManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.roots.OrderRootType
import com.intellij.openapi.roots.libraries.LibraryTablesRegistrar
import com.intellij.openapi.vfs.VfsUtil
import com.intellij.openapi.vfs.VirtualFile
import software.amazon.awssdk.services.lambda.LambdaClient
import software.amazon.awssdk.services.lambda.model.CreateFunctionRequest
import software.amazon.awssdk.services.lambda.model.FunctionCode
import software.amazon.awssdk.services.lambda.model.Runtime
import software.amazon.awssdk.services.s3.S3Client
import software.amazon.awssdk.services.s3.model.PutObjectRequest
import software.aws.toolkits.jetbrains.core.AwsClientManager
import java.io.File
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.Paths
import java.util.stream.Collectors
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream

object LambdaCreatorFactory {
    fun create(clientManager: AwsClientManager): LambdaCreator {
        return LambdaCreator(
                LambdaPackager(),
                CodeUploader(clientManager.getClient()),
                LambdaFunctionCreator(clientManager.getClient())
        )
    }
}

class LambdaCreator(
    private val packager: LambdaPackager,
    private val uploader: CodeUploader,
    private val functionCreator: LambdaFunctionCreator
) {
    fun createLambda(functionDetails: LambdaFunction, project: Project, onComplete: (String) -> Unit) {
        packager.doPackaging(project) {
            uploader.upload(functionDetails, it) { key, version ->
                functionCreator.create(functionDetails, key, version, onComplete)
            }
        }
    }
}

class LambdaFunctionCreator(private val lambdaClient: LambdaClient) {
    fun create(
        details: LambdaFunction,
        codeObjectKey: String,
        codeObjectVersion: String?,
        onComplete: (String) -> Unit
    ) {
        ApplicationManager.getApplication().executeOnPooledThread {
            val code = FunctionCode.builder().s3Bucket(details.s3Bucket.name()).s3Key(codeObjectKey)
            if (codeObjectVersion != null) {
                code.s3ObjectVersion(codeObjectVersion)
            }
            val req = CreateFunctionRequest.builder()
                    .handler(details.handler)
                    .functionName(details.name)
                    .role(details.iamRole.arn)
                    .runtime(Runtime.JAVA8)
                    .code(code.build())
                    .build()
            val result = lambdaClient.createFunction(req)
            onComplete(result.functionArn())
        }
    }
}

class CodeUploader(private val s3Client: S3Client) {
    fun upload(functionDetails: LambdaFunction, code: Path, onComplete: (String, String?) -> Unit) {
        ApplicationManager.getApplication().executeOnPooledThread {
            val key = "${functionDetails.name}.zip"
            val por = PutObjectRequest.builder().bucket(functionDetails.s3Bucket.name())
                    .key(key)
                    .build()
            val result = s3Client.putObject(por, code)
            onComplete(key, result.versionId())
        }
    }
}

class LambdaPackager {
    fun doPackaging(project: Project, onComplete: (Path) -> Unit) {
        CompilerManager.getInstance(project).rebuild { aborted, errors, _, compileContext ->
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