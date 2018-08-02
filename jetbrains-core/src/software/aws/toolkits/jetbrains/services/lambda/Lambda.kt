package software.aws.toolkits.jetbrains.services.lambda

import com.intellij.lang.java.JavaLanguage
import com.intellij.openapi.project.Project
import com.intellij.psi.NavigatablePsiElement
import com.intellij.psi.search.GlobalSearchScope
import com.jetbrains.python.PythonLanguage
import software.amazon.awssdk.services.lambda.LambdaClient
import software.amazon.awssdk.services.lambda.model.CreateFunctionResponse
import software.amazon.awssdk.services.lambda.model.FunctionConfiguration
import software.amazon.awssdk.services.lambda.model.Runtime

object Lambda {
    fun findPsiElementsForHandler(project: Project, runtime: Runtime, handler: String): Array<NavigatablePsiElement>? {
        return LambdaHandlerResolver.getResolverForRuntime(runtime)
            ?.findPsiElements(project, handler, GlobalSearchScope.allScope(project))
    }
}

data class LambdaFunction(
    val name: String,
    val description: String?,
    val arn: String,
    val lastModified: String,
    val handler: String,
    val client: LambdaClient,
    val runtime: Runtime
)

fun FunctionConfiguration.toDataClass(client: LambdaClient) = LambdaFunction(
    name = this.functionName(),
    description = this.description(),
    arn = this.functionArn(),
    lastModified = this.lastModified(),
    handler = this.handler(),
    runtime = this.runtime(),
    client = client
)

fun CreateFunctionResponse.toDataClass(client: LambdaClient) = LambdaFunction(
    name = this.functionName(),
    description = this.description(),
    arn = this.functionArn(),
    lastModified = this.lastModified(),
    handler = this.handler(),
    runtime = this.runtime(),
    client = client
)

/**
 * Converts the runtime into the [com.intellij.lang.Language] id
 */
fun Runtime.getLanguageId(): String? {
    return when {
        this.name.startsWith("JAVA") -> JavaLanguage.INSTANCE.id
        this.name.startsWith("GO") -> "go" // Defined in com.goide.GoLanguage
        this.name.startsWith("PYTHON") -> PythonLanguage.INSTANCE.id
        else -> null
    }
}