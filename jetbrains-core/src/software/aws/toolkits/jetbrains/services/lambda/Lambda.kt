// Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda

import com.intellij.openapi.project.Project
import com.intellij.psi.NavigatablePsiElement
import com.intellij.psi.search.GlobalSearchScope
import software.amazon.awssdk.services.lambda.model.CreateFunctionResponse
import software.amazon.awssdk.services.lambda.model.FunctionConfiguration
import software.amazon.awssdk.services.lambda.model.Runtime
import software.aws.toolkits.core.region.AwsRegion

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
    credentialProviderId = credentialProviderId,
    region = region
)

fun CreateFunctionResponse.toDataClass(credentialProviderId: String, region: AwsRegion) = LambdaFunction(
    name = this.functionName(),
    description = this.description(),
    arn = this.functionArn(),
    lastModified = this.lastModified(),
    handler = this.handler(),
    runtime = this.runtime(),
    credentialProviderId = credentialProviderId,
    region = region
)