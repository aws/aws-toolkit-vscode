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
import software.aws.toolkits.jetbrains.utils.tryNotify
import java.nio.file.Path

object LambdaCreatorFactory {
    fun create(clientManager: AwsClientManager, packager: LambdaPackager): LambdaCreator {
        return LambdaCreator(
                packager,
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
    fun createLambda(functionDetails: FunctionUploadDetails, module: Module, file: PsiFile, onComplete: (LambdaFunction) -> Unit) {
        packager.createPackage(module, file) {
            uploader.upload(functionDetails, it) { key, version ->
                functionCreator.create(functionDetails, key, version, onComplete)
            }
        }
    }
}

class LambdaFunctionCreator(private val lambdaClient: LambdaClient) {
    fun create(
        details: FunctionUploadDetails,
        codeObjectKey: String,
        codeObjectVersion: String?,
        onComplete: (LambdaFunction) -> Unit
    ) {
        ApplicationManager.getApplication().executeOnPooledThread {
            val code = FunctionCode.builder().s3Bucket(details.s3Bucket).s3Key(codeObjectKey)
            if (codeObjectVersion != null) {
                code.s3ObjectVersion(codeObjectVersion)
            }
            val req = CreateFunctionRequest.builder()
                    .handler(details.handler)
                    .functionName(details.name)
                    .role(details.iamRole.arn)
                    .runtime(details.runtime)
                    .code(code.build())
                    .build()

            val result = tryNotify("Failed to create lambda function") { lambdaClient.createFunction(req) }
            result?.toDataClass(lambdaClient)?.run(onComplete)
        }
    }
}

class CodeUploader(private val s3Client: S3Client) {
    fun upload(functionDetails: FunctionUploadDetails, code: Path, onComplete: (String, String?) -> Unit) {
        ApplicationManager.getApplication().executeOnPooledThread {
            val key = "${functionDetails.name}.zip"
            val por = PutObjectRequest.builder().bucket(functionDetails.s3Bucket)
                    .key(key)
                    .build()
            val result = tryNotify("Failed to upload lambda function code to s3") { s3Client.putObject(por, code) }
            result?.run { onComplete(key, this.versionId()) }
        }
    }
}