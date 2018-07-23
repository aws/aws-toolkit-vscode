package software.aws.toolkits.jetbrains.services.lambda.upload

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.module.Module
import com.intellij.psi.PsiFile
import software.amazon.awssdk.services.lambda.LambdaClient
import software.amazon.awssdk.services.lambda.model.CreateFunctionRequest
import software.amazon.awssdk.services.lambda.model.FunctionCode
import software.amazon.awssdk.services.s3.S3Client
import software.amazon.awssdk.services.s3.model.PutObjectRequest
import software.aws.toolkits.jetbrains.core.AwsClientManager
import software.aws.toolkits.jetbrains.services.lambda.LambdaFunction
import software.aws.toolkits.jetbrains.services.lambda.LambdaPackager
import software.aws.toolkits.jetbrains.services.lambda.toDataClass
import software.aws.toolkits.resources.message
import java.nio.file.Path
import java.util.concurrent.CompletableFuture
import java.util.concurrent.CompletionStage

object LambdaCreatorFactory {
    fun create(clientManager: AwsClientManager, packager: LambdaPackager): LambdaCreator {
        return LambdaCreator(
            packager,
            CodeUploader(clientManager.getClient()),
            LambdaFunctionCreator(clientManager.getClient())
        )
    }
}

class LambdaCreator internal constructor(
    private val packager: LambdaPackager,
    private val uploader: CodeUploader,
    private val functionCreator: LambdaFunctionCreator
) {
    fun createLambda(functionDetails: FunctionUploadDetails, module: Module, file: PsiFile): CompletionStage<LambdaFunction> {
        return packager.createPackage(module, file)
            .thenCompose { uploader.upload(functionDetails, it) }
            .thenCompose { functionCreator.create(functionDetails, it) }
    }
}

internal class LambdaFunctionCreator(private val lambdaClient: LambdaClient) {
    fun create(
        details: FunctionUploadDetails,
        uploadedCode: UploadedCode
    ): CompletionStage<LambdaFunction> {
        val future = CompletableFuture<LambdaFunction>()
        ApplicationManager.getApplication().executeOnPooledThread {
            try {
                val code = FunctionCode.builder().s3Bucket(details.s3Bucket).s3Key(uploadedCode.key)
                uploadedCode.version?.run { code.s3ObjectVersion(this) }
                val req = CreateFunctionRequest.builder()
                    .handler(details.handler)
                    .functionName(details.name)
                    .role(details.iamRole.arn)
                    .runtime(details.runtime)
                    .code(code.build())
                    .build()

                val result = lambdaClient.createFunction(req)
                future.complete(result.toDataClass(lambdaClient))
            } catch (e: Exception) {
                future.completeExceptionally(e)
            }
        }
        return future
    }
}

internal class CodeUploader(private val s3Client: S3Client) {
    fun upload(functionDetails: FunctionUploadDetails, code: Path): CompletionStage<UploadedCode> {
        val future = CompletableFuture<UploadedCode>()
        ApplicationManager.getApplication().executeOnPooledThread {
            try {
                val key = "${functionDetails.name}.zip"
                val por = PutObjectRequest.builder().bucket(functionDetails.s3Bucket).key(key).build()
                val result = s3Client.putObject(por, code)
                future.complete(UploadedCode(key, result.versionId()))
            } catch (e: Exception) {
                future.completeExceptionally(RuntimeException(message("lambda.create.failed_to_upload"), e))
            }
        }
        return future
    }
}

internal data class UploadedCode(val key: String, val version: String?)