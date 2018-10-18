// Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda

import com.intellij.lang.Language
import com.intellij.openapi.extensions.ExtensionPointName
import com.intellij.openapi.project.Project
import com.intellij.psi.NavigatablePsiElement
import com.intellij.psi.PsiElement
import com.intellij.psi.search.GlobalSearchScope
import software.amazon.awssdk.services.lambda.model.Runtime

/**
 * Used to expose Lambda handler information for different [Language]s / [Runtime]s
 */
interface LambdaHandlerResolver {

    /**
     * Converts the handler string into PSI elements that represent it. I.e. if the Handler points to a file, return the
     * class, or if a method return the method.
     *
     * @return Matching PSI elements or empty array if unable to locate one
     */
    fun findPsiElements(project: Project, handler: String, searchScope: GlobalSearchScope): Array<NavigatablePsiElement>

    /**
     * For a given [PsiElement] determine if it represents a lambda handler.
     *
     * If the [element] matches the AWS Lambda definition for a handler in the given language,
     * return the handler string representation, else null.
     *
     * Should be done at the lowest possible level (i.e. [com.intellij.psi.PsiIdentifier]
     * for Java implementations).
     *
     * @see com.intellij.codeInsight.daemon.LineMarkerProvider.getLineMarkerInfo
     */
    fun determineHandler(element: PsiElement): String?

    /**
     * Given a [handler] create a shorter name used for display.
     */
    fun handlerDisplayName(handler: String): String = handler

    companion object : RuntimeGroupExtensionPointObject<LambdaHandlerResolver>(ExtensionPointName.create("aws.toolkit.lambda.handlerResolver"))
}