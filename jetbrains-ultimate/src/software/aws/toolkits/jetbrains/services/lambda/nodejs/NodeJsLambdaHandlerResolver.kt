// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.nodejs

import com.intellij.lang.javascript.JSTokenTypes
import com.intellij.lang.javascript.psi.JSAssignmentExpression
import com.intellij.lang.javascript.psi.JSDefinitionExpression
import com.intellij.lang.javascript.psi.JSFunction
import com.intellij.lang.javascript.psi.JSReferenceExpression
import com.intellij.lang.javascript.psi.ecmal4.JSAttributeList
import com.intellij.lang.javascript.psi.resolve.JSClassResolver
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.io.FileUtilRt
import com.intellij.openapi.vfs.VfsUtilCore
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.psi.NavigatablePsiElement
import com.intellij.psi.PsiElement
import com.intellij.psi.search.GlobalSearchScope
import software.aws.toolkits.jetbrains.services.lambda.LambdaHandlerResolver

class NodeJsLambdaHandlerResolver : LambdaHandlerResolver {

    override fun version(): Int = 1

    override fun findPsiElements(
        project: Project,
        handler: String,
        searchScope: GlobalSearchScope
    ): Array<NavigatablePsiElement> {
        val lastDotIndex = handler.lastIndexOf(".")
        if (lastDotIndex < 0) {
            return NavigatablePsiElement.EMPTY_NAVIGATABLE_ELEMENT_ARRAY
        }
        val fileName = handler.substring(0, lastDotIndex)
        val elementName = handler.substring(lastDotIndex + 1)

        return JSClassResolver.findElementsByNameIncludingImplicit(elementName, searchScope, false)
            .filter { it.isValidHandlerElement(fileName) }
            .toTypedArray()
    }

    /**
     * Whether the element is a valid Lambda handler found by [JSClassResolver] through the handler name.
     */
    private fun PsiElement.isValidHandlerElement(fileName: String): Boolean {
        val virtualFile = this.containingFile.virtualFile ?: return false
        val sourceRoot = inferSourceRoot(project, virtualFile) ?: return false

        val relativePath = VfsUtilCore.findRelativePath(sourceRoot, virtualFile, '/') ?: return false
        return this is NavigatablePsiElement &&
            this.parent?.isValidLambdaHandler() == true &&
            FileUtilRt.getNameWithoutExtension(relativePath) == fileName
    }

    // NodeJs lambda handler string format should be: parent/folders/file.handler and handler element should follow
    // https://docs.aws.amazon.com/lambda/latest/dg/nodejs-prog-model-handler.html
    override fun determineHandler(element: PsiElement): String? {
        if (!element.isValidHandlerIdentifier()) {
            return null
        }

        val virtualFile = element.containingFile.virtualFile ?: return null

        val sourceRoot = inferSourceRoot(element.project, virtualFile) ?: return null
        val relativePath = VfsUtilCore.findRelativePath(sourceRoot, virtualFile, '/') ?: return null
        val prefix = FileUtilRt.getNameWithoutExtension(relativePath)
        val handlerName = element.text

        return "$prefix.$handlerName"
    }

    override fun determineHandlers(element: PsiElement, file: VirtualFile): Set<String> =
        determineHandler(element)?.let { setOf(it) }.orEmpty()

    /**
     * Whether the element is a valid lambda handler identifier.
     */
    private fun PsiElement.isValidHandlerIdentifier(): Boolean {
        if (this.node?.elementType != JSTokenTypes.IDENTIFIER) {
            return false
        }

        val exportsDefinition = this.parent?.parent ?: return false

        if (!exportsDefinition.isExportsDefinition()) {
            return false
        }

        val lambdaHandlerAssignment = exportsDefinition.parent as? JSAssignmentExpression ?: return false

        if (lambdaHandlerAssignment.rOperand?.isLambdaFunctionExpression() != true) {
            return false
        }
        return true
    }

    /**
     * Whether the element is top level PSI element for a valid Lambda handler. It must be in the format as:
     * exports.lambdaHandler = functionExpression
     */
    private fun PsiElement.isValidLambdaHandler(): Boolean =
        this is JSAssignmentExpression &&
            this.lOperand?.isExportsDefinition() == true &&
            this.rOperand?.isLambdaFunctionExpression() == true

    /**
     * Whether the element is a left-hand operand for a valid Lambda handler assignment. It should be in the format as:
     * exports.lambdaHandler
     */
    private fun PsiElement.isExportsDefinition(): Boolean =
        this is JSDefinitionExpression &&
            this.children.size == 1 &&
            this.children[0].isExportsReference()

    // Whether the element is function element that follows AWS Lambda function format. It allows non-async functions to
    // have at most 3 parameters while async functions 2.
    private fun PsiElement.isLambdaFunctionExpression(): Boolean {
        if (this !is JSFunction) return false
        val parameterSize = this.parameters.size
        val isAsyncFunction = this.attributeList?.hasModifier(JSAttributeList.ModifierType.ASYNC) == true
        return (isAsyncFunction && parameterSize <= 2) || (!isAsyncFunction && parameterSize <= 3)
    }

    // Whether the element is exports reference element in the format of exports.lambdaHandler
    private fun PsiElement.isExportsReference(): Boolean =
        this is JSReferenceExpression &&
            this.children.size == 3 &&
            this.children[0].isExports() &&
            this.children[1].node?.elementType == JSTokenTypes.DOT &&
            this.children[2].node?.elementType == JSTokenTypes.IDENTIFIER

    // Whether the element is exports reference
    private fun PsiElement.isExports(): Boolean =
        this is JSReferenceExpression &&
            this.children.size == 1 &&
            this.children[0].node?.elementType == JSTokenTypes.IDENTIFIER &&
            this.children[0].text == "exports"
}
