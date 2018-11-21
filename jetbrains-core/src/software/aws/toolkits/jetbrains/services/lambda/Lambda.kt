// Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda

import com.intellij.openapi.project.Project
import com.intellij.psi.NavigatablePsiElement
import com.intellij.psi.search.GlobalSearchScope
import software.amazon.awssdk.services.lambda.model.CreateFunctionResponse
import software.amazon.awssdk.services.lambda.model.FunctionConfiguration
import software.amazon.awssdk.services.lambda.model.GetFunctionConfigurationResponse
import software.amazon.awssdk.services.lambda.model.Runtime
import software.amazon.awssdk.services.lambda.model.TracingMode
import software.amazon.awssdk.services.lambda.model.UpdateFunctionConfigurationResponse
import software.aws.toolkits.core.region.AwsRegion
import software.aws.toolkits.jetbrains.services.iam.IamRole

object Lambda {
    fun findPsiElementsForHandler(project: Project, runtime: Runtime, handler: String): Array<NavigatablePsiElement> {
        val resolver = runtime.runtimeGroup?.let { LambdaHandlerResolver.getInstance(it) } ?: return emptyArray()
        return resolver.findPsiElements(project, handler, GlobalSearchScope.allScope(project))
    }
}

data class LambdaFunction(
    val name: String,
    val description: String?,
    val arn: String,
    val lastModified: String,
    val handler: String,
    val runtime: Runtime,
    val envVariables: Map<String, String>?,
    val timeout: Int,
    val memorySize: Int,
    val xrayEnabled: Boolean,
    val role: IamRole,
    val region: AwsRegion,
    val credentialProviderId: String
)

fun FunctionConfiguration.toDataClass(credentialProviderId: String, region: AwsRegion) = LambdaFunction(
    name = this.functionName(),
    description = this.description(),
    arn = this.functionArn(),
    lastModified = this.lastModified(),
    handler = this.handler(),
    runtime = this.runtime(),
    envVariables = this.environment()?.variables(),
    timeout = this.timeout(),
    memorySize = this.memorySize(),
    role = IamRole(this.role()),
    credentialProviderId = credentialProviderId,
    xrayEnabled = this.tracingConfig().mode() == TracingMode.ACTIVE,
    region = region
)

fun CreateFunctionResponse.toDataClass(credentialProviderId: String, region: AwsRegion) = LambdaFunction(
    name = this.functionName(),
    description = this.description(),
    arn = this.functionArn(),
    lastModified = this.lastModified(),
    handler = this.handler(),
    runtime = this.runtime(),
    envVariables = this.environment()?.variables(),
    timeout = this.timeout(),
    memorySize = this.memorySize(),
    role = IamRole(this.role()),
    credentialProviderId = credentialProviderId,
    region = region,
    xrayEnabled = this.tracingConfig().mode() == TracingMode.ACTIVE
)

fun UpdateFunctionConfigurationResponse.toDataClass(credentialProviderId: String, region: AwsRegion) = LambdaFunction(
    name = this.functionName(),
    description = this.description(),
    arn = this.functionArn(),
    lastModified = this.lastModified(),
    handler = this.handler(),
    runtime = this.runtime(),
    envVariables = this.environment()?.variables(),
    timeout = this.timeout(),
    memorySize = this.memorySize(),
    role = IamRole(this.role()),
    credentialProviderId = credentialProviderId,
    region = region,
    xrayEnabled = this.tracingConfig().mode() == TracingMode.ACTIVE
)

fun GetFunctionConfigurationResponse.toDataClass(credentialProviderId: String, region: AwsRegion) = LambdaFunction(
    name = this.functionName(),
    description = this.description(),
    arn = this.functionArn(),
    lastModified = this.lastModified(),
    handler = this.handler(),
    runtime = this.runtime(),
    envVariables = this.environment()?.variables(),
    timeout = this.timeout(),
    memorySize = this.memorySize(),
    role = IamRole(this.role()),
    credentialProviderId = credentialProviderId,
    region = region,
    xrayEnabled = this.tracingConfig().mode() == TracingMode.ACTIVE
)