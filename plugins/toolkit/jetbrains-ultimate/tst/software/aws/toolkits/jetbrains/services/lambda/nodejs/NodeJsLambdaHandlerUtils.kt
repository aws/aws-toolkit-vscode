// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.nodejs

import com.intellij.lang.javascript.psi.JSDefinitionExpression
import com.intellij.lang.javascript.psi.ecma6.TypeScriptVariable
import com.intellij.psi.PsiElement
import com.intellij.psi.search.GlobalSearchScope
import com.intellij.testFramework.runInEdtAndWait
import org.assertj.core.api.Assertions.assertThat
import software.aws.toolkits.jetbrains.services.lambda.BuiltInRuntimeGroups
import software.aws.toolkits.jetbrains.services.lambda.LambdaHandlerResolver
import software.aws.toolkits.jetbrains.services.lambda.RuntimeGroup
import software.aws.toolkits.jetbrains.utils.rules.NodeJsCodeInsightTestFixtureRule

fun assertDetermineHandler(handlerElement: PsiElement, expectedHandlerFullName: String?) {
    val resolver = LambdaHandlerResolver.getInstance(RuntimeGroup.getById(BuiltInRuntimeGroups.NodeJs))

    runInEdtAndWait {
        if (expectedHandlerFullName != null) {
            assertThat(resolver.determineHandler(handlerElement)).isEqualTo(expectedHandlerFullName)
        } else {
            assertThat(resolver.determineHandler(handlerElement)).isNull()
        }
    }
}

fun assertFindPsiElements(projectRule: NodeJsCodeInsightTestFixtureRule, handler: String, shouldBeFound: Boolean) {
    val resolver = LambdaHandlerResolver.getInstance(RuntimeGroup.getById(BuiltInRuntimeGroups.NodeJs))
    runInEdtAndWait {
        val project = projectRule.fixture.project
        val lambdas = resolver.findPsiElements(project, handler, GlobalSearchScope.allScope(project))
        if (shouldBeFound) {
            assertThat(lambdas).hasSize(1)
            assertThat(lambdas[0]).isInstanceOfAny(JSDefinitionExpression::class.java, TypeScriptVariable::class.java)
        } else {
            assertThat(lambdas).isEmpty()
        }
    }
}
