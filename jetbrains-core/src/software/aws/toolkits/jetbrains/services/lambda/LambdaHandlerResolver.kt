// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda

import com.intellij.lang.Language
import com.intellij.openapi.extensions.ExtensionPointName
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.psi.NavigatablePsiElement
import com.intellij.psi.PsiElement
import com.intellij.psi.search.GlobalSearchScope
import software.amazon.awssdk.services.lambda.model.Runtime

/**
 * Used to expose Lambda handler information for different [Language]s / [Runtime]s
 */
interface LambdaHandlerResolver {
    /**
     * The version of this indexer. It should be incremented with the indexing logic has been modified
     */
    fun version(): Int

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
     * Return a set of valid handlers from the given [PsiElement]. Different from [determineHandler], it returns all the
     * valid handler strings contained by the [element].
     *
     * For Java implementation, if the element is a Java class, it returns all the valid methods either defined by this
     * class or its super class(es).
     *
     * @param element The [PsiElement] that containing all the handlers
     * @param file The underlying [VirtualFile] for the [PsiElement]. In JetBrains indexing, the [VirtualFile] is not
     * attached to the target [PsiElement], you need to explicitly pass in this parameter.
     *
     * @see LambdaHandlerIndex.getIndexer
     */
    fun determineHandlers(element: PsiElement, file: VirtualFile): Set<String>

    /**
     * Given a [handler] create a shorter name used for display.
     */
    fun handlerDisplayName(handler: String): String = handler

    /**
     * Given a handler, return whether to show this handler all the time
     */
    fun shouldShowLineMarker(handler: String): Boolean = false

    /**
     * Given a handler string, return whether specified structure exists in PSI or not
     *
     * @param handler - handler string value
     */
    fun isHandlerValid(project: Project, handler: String): Boolean =
        findPsiElements(project, handler, GlobalSearchScope.allScope(project)).isNotEmpty()

    companion object : RuntimeGroupExtensionPointObject<LambdaHandlerResolver>(ExtensionPointName.create("aws.toolkit.lambda.handlerResolver"))
}
